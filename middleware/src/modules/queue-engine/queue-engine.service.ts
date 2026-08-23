import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents } from '../../events/domain-events';
import type {
  KioskIdentityConfirmedPayload,
  KioskPhoneCapturedPayload,
  QueueAssignedPayload,
  QueueClaimConfirmedPayload,
  QueueClaimTimeoutPayload,
  QueueEnqueuedPayload,
  QueueNotifiedPayload,
  QueueShiftedPayload,
  SlotFreedPayload,
} from '../../events/domain-events';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { LprService } from '../lpr/lpr.service';
import { CLAIM_TIMERS_QUEUE } from './claim-timer.types';
import type { ClaimTimerJobData } from './claim-timer.types';
import type {
  FreedBatchDto,
  SetAvailableSlotsDto,
  SlotFreedDto,
} from './dto/slot-freed.dto';
import { nextShiftDistance, SLOTS_AVAILABLE_KEY } from './queue.logic';
import { QueueRepository } from './queue.repository';

@Injectable()
export class QueueEngineService {
  constructor(
    private readonly repo: QueueRepository,
    private readonly events: DomainEventBus,
    private readonly lpr: LprService,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(CLAIM_TIMERS_QUEUE) private readonly claimTimers: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QueueEngineService.name);
  }

  /* ─── Slot management (absorbed from SlotsService) ─── */

  async getAvailable(): Promise<{
    available: number;
    activeClaims: Awaited<ReturnType<QueueEngineService['listActiveClaims']>>;
  }> {
    const raw = await this.redis.get(SLOTS_AVAILABLE_KEY);
    const available = raw ? Number(raw) : 0;
    const activeClaims = await this.listActiveClaims();
    return {
      available: Number.isFinite(available) ? available : 0,
      activeClaims,
    };
  }

  async setAvailable(
    dto: SetAvailableSlotsDto,
  ): Promise<{ available: number }> {
    await this.redis.set(SLOTS_AVAILABLE_KEY, String(dto.available));
    this.logger.info({ available: dto.available }, 'slots.available.set');
    return { available: dto.available };
  }

  freed(dto: SlotFreedDto, correlationId?: string): SlotFreedPayload {
    const payload: SlotFreedPayload = {
      slotId: dto.slotId,
      freedAt: dto.freedAt ?? new Date().toISOString(),
      correlationId,
    };
    this.logger.info(payload, 'slot.freed.ingest');
    this.events.emit(DomainEvents.SlotFreed, payload);
    void this.tryNotifyNext(payload.slotId, correlationId);
    return payload;
  }

  async freedBatch(
    dto: FreedBatchDto,
    correlationId?: string,
  ): Promise<{
    requested: number;
    notified: number;
    slots: Array<{ slotId: string; notified: boolean }>;
    available: number;
  }> {
    const stored = await this.getAvailable();
    const requested = dto.count ?? stored.available;
    if (requested < 1) {
      return {
        requested: 0,
        notified: 0,
        slots: [],
        available: stored.available,
      };
    }

    const slots: Array<{ slotId: string; notified: boolean }> = [];
    let notified = 0;
    const stamp = Date.now();

    for (let i = 1; i <= requested; i++) {
      const slotId = `slot-${stamp}-${i}`;
      const payload: SlotFreedPayload = {
        slotId,
        freedAt: new Date().toISOString(),
        correlationId,
      };
      this.events.emit(DomainEvents.SlotFreed, payload);
      const ok = await this.tryNotifyNext(slotId, correlationId);
      if (ok) notified += 1;
      slots.push({ slotId, notified: ok });
    }

    const remaining = Math.max(0, stored.available - requested);
    await this.redis.set(SLOTS_AVAILABLE_KEY, String(remaining));

    this.logger.info({ requested, notified, remaining }, 'slots.freed_batch');
    return { requested, notified, slots, available: remaining };
  }

  /* ─── Queue event handlers ─── */

  @OnEvent(DomainEvents.KioskIdentityConfirmed)
  async onIdentityConfirmed(
    payload: KioskIdentityConfirmedPayload,
  ): Promise<void> {
    await this.enqueueVisit(payload);
  }

  @OnEvent(DomainEvents.KioskPhoneCaptured)
  async onPhoneCaptured(payload: KioskPhoneCapturedPayload): Promise<void> {
    await this.enqueueVisit(payload);
  }

  private async enqueueVisit(
    payload: KioskIdentityConfirmedPayload | KioskPhoneCapturedPayload,
  ): Promise<void> {
    const { created, entry } = await this.repo.enqueue({
      plateNumber: payload.plateNumber,
      phone: payload.visitPhone,
      gateId: payload.gateId,
      sessionId: payload.sessionId,
    });
    if (!created) {
      this.logger.info(
        { entryId: entry.id, plate: payload.plateNumber },
        'queue.enqueue.idempotent_skip',
      );
      return;
    }
    const enqueued: QueueEnqueuedPayload = {
      entryId: entry.id,
      plateNumber: entry.plateNumber,
      phone: entry.phone,
      gateId: entry.gateId,
      sessionId: entry.sessionId,
      enqueuedAt: entry.enqueuedAt,
      correlationId: payload.correlationId,
    };
    this.events.emit(DomainEvents.QueueEnqueued, enqueued);
    await this.lpr.markActive(
      entry.plateNumber,
      entry.gateId,
      'queue_enqueued',
    );
  }

  @OnEvent(DomainEvents.QueueClaimConfirmed)
  async onClaimConfirmed(payload: QueueClaimConfirmedPayload): Promise<void> {
    const result = await this.repo.confirmAndAssign(
      payload.entryId,
      payload.slotId,
    );
    if (!result) {
      this.logger.warn(
        { entryId: payload.entryId, slotId: payload.slotId },
        'queue.claim.late_or_mismatch',
      );
      return;
    }

    if (result.claim.claimJobId) {
      try {
        const job = await this.claimTimers.getJob(result.claim.claimJobId);
        await job?.remove();
      } catch {
        /* timer already gone */
      }
    }

    const assignedPayload: QueueAssignedPayload = {
      entryId: result.entry.id,
      plateNumber: result.entry.plateNumber,
      slotId: payload.slotId,
      assignedAt: new Date().toISOString(),
      correlationId: payload.correlationId,
    };
    this.events.emit(DomainEvents.QueueAssigned, assignedPayload);
    await this.lpr.clearActive(result.entry.plateNumber);
  }

  /**
   * Reserve the next waiting entry for this slot, schedule a claim timer,
   * and emit the notified event. Returns true if a reservation was made.
   */
  async tryNotifyNext(
    slotId: string,
    correlationId?: string,
  ): Promise<boolean> {
    const delay = this.config.get('CLAIM_TIMEOUT_MS', { infer: true });

    const tempJobId = `claim-pending-${slotId}-${Date.now()}`;
    const job = await this.claimTimers.add(
      'claim-timeout',
      {
        entryId: '',
        slotId,
        plateNumber: '',
        phone: '',
        consecutiveMissesAtNotify: 0,
        correlationId,
      },
      { delay, removeOnComplete: true, removeOnFail: 100, jobId: tempJobId },
    );

    const reservation = await this.repo.reserveNextForSlot(
      slotId,
      String(job.id),
    );
    if (!reservation) {
      try {
        await job.remove();
      } catch {
        /* already gone */
      }
      if (!(await this.repo.getActiveClaim(slotId))) {
        this.logger.info({ slotId }, 'queue.empty');
      }
      return false;
    }

    const { entry, consecutiveMisses } = reservation;
    const jobData: ClaimTimerJobData = {
      entryId: entry.id,
      slotId,
      plateNumber: entry.plateNumber,
      phone: entry.phone,
      consecutiveMissesAtNotify: consecutiveMisses,
      correlationId,
    };
    await job.updateData(jobData);

    const notifiedPayload: QueueNotifiedPayload = {
      entryId: entry.id,
      plateNumber: entry.plateNumber,
      phone: entry.phone,
      slotId,
      claimJobId: String(job.id),
      notifiedAt: entry.notifiedAt!,
      consecutiveMisses,
      correlationId,
    };
    this.events.emit(DomainEvents.QueueNotified, notifiedPayload);
    return true;
  }

  async handleClaimTimeout(data: ClaimTimerJobData): Promise<void> {
    const entry = await this.repo.getEntry(data.entryId);
    if (!entry) return;
    if (entry.confirmed || entry.status === 'assigned') {
      this.logger.info({ entryId: data.entryId }, 'queue.claim.already_done');
      return;
    }

    const shiftDistance = nextShiftDistance(data.consecutiveMissesAtNotify);
    const timeoutPayload: QueueClaimTimeoutPayload = {
      entryId: data.entryId,
      plateNumber: data.plateNumber,
      slotId: data.slotId,
      timedOutAt: new Date().toISOString(),
      shiftDistance,
      correlationId: data.correlationId,
    };
    this.events.emit(DomainEvents.QueueClaimTimeout, timeoutPayload);

    const shifted = await this.repo.shiftBack(data.entryId, shiftDistance);
    if (!shifted) return;

    await this.repo.setConsecutiveMisses(
      data.slotId,
      data.consecutiveMissesAtNotify + 1,
    );

    const shiftedPayload: QueueShiftedPayload = {
      entryId: shifted.entry.id,
      plateNumber: shifted.entry.plateNumber,
      shiftDistance,
      newPosition: shifted.newPosition,
      consecutiveMisses: data.consecutiveMissesAtNotify + 1,
      correlationId: data.correlationId,
    };
    this.events.emit(DomainEvents.QueueShifted, shiftedPayload);

    await this.tryNotifyNext(data.slotId, data.correlationId);
  }

  async listQueue(): Promise<unknown[]> {
    const ids = await this.repo.listIds();
    const entries = await Promise.all(ids.map((id) => this.repo.getEntry(id)));
    return entries.filter(Boolean);
  }

  async listActiveClaims() {
    return this.repo.listActiveClaims();
  }
}

@Processor(CLAIM_TIMERS_QUEUE)
export class ClaimTimerProcessor extends WorkerHost {
  constructor(
    private readonly engine: QueueEngineService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(ClaimTimerProcessor.name);
  }

  async process(job: Job<ClaimTimerJobData>): Promise<void> {
    this.logger.info(
      { jobId: job.id, entryId: job.data.entryId },
      'queue.claim.timer.fired',
    );
    await this.engine.handleClaimTimeout(job.data);
  }
}
