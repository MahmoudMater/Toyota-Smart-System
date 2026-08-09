import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Job, Queue } from 'bullmq';
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
import { LprService } from '../lpr/lpr.service';
import { CLAIM_TIMERS_QUEUE } from './claim-timer.types';
import type { ClaimTimerJobData } from './claim-timer.types';
import { nextShiftDistance } from './queue.logic';
import { QueueRepository } from './queue.repository';

@Injectable()
export class QueueEngineService {
  constructor(
    private readonly repo: QueueRepository,
    private readonly events: DomainEventBus,
    private readonly lpr: LprService,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(CLAIM_TIMERS_QUEUE) private readonly claimTimers: Queue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QueueEngineService.name);
  }

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
    await this.lpr.markActive(entry.plateNumber, entry.gateId, 86_400);
  }

  @OnEvent(DomainEvents.SlotFreed)
  async onSlotFreed(payload: SlotFreedPayload): Promise<void> {
    await this.tryNotifyNext(payload.slotId, payload.correlationId);
  }

  @OnEvent(DomainEvents.QueueClaimConfirmed)
  async onClaimConfirmed(payload: QueueClaimConfirmedPayload): Promise<void> {
    const claim = await this.repo.getActiveClaim();
    if (!claim || claim.entryId !== payload.entryId) {
      this.logger.warn(
        { entryId: payload.entryId },
        'queue.claim.late_or_mismatch',
      );
      return;
    }
    await this.repo.markConfirmed(payload.entryId);
    const assigned = await this.repo.assignAndRemove(payload.entryId);
    if (!assigned) return;

    // Cancel pending timer if possible
    if (claim.claimJobId) {
      try {
        const job = await this.claimTimers.getJob(claim.claimJobId);
        await job?.remove();
      } catch {
        /* ignore */
      }
    }

    const assignedPayload: QueueAssignedPayload = {
      entryId: assigned.id,
      plateNumber: assigned.plateNumber,
      slotId: payload.slotId,
      assignedAt: new Date().toISOString(),
      correlationId: payload.correlationId,
    };
    this.events.emit(DomainEvents.QueueAssigned, assignedPayload);
    await this.lpr.clearActive(assigned.plateNumber);
  }

  async tryNotifyNext(slotId: string, correlationId?: string): Promise<boolean> {
    const active = await this.repo.getActiveClaim();
    if (active) {
      this.logger.info({ active }, 'queue.notify.skipped_active_claim');
      return false;
    }
    const next = await this.repo.peekWaiting();
    if (!next) {
      this.logger.info({ slotId }, 'queue.empty');
      return false;
    }

    const consecutiveMisses = await this.repo.getConsecutiveMisses();
    const delay = this.config.get('CLAIM_TIMEOUT_MS', { infer: true });
    const jobData: ClaimTimerJobData = {
      entryId: next.id,
      slotId,
      plateNumber: next.plateNumber,
      phone: next.phone,
      consecutiveMissesAtNotify: consecutiveMisses,
      correlationId,
    };
    // BullMQ custom jobId cannot contain ':'
    const job = await this.claimTimers.add('claim-timeout', jobData, {
      delay,
      removeOnComplete: true,
      removeOnFail: 100,
      jobId: `claim-${next.id}-${slotId}-${Date.now()}`,
    });

    const notified = await this.repo.markNotified(
      next,
      slotId,
      String(job.id),
    );
    const notifiedPayload: QueueNotifiedPayload = {
      entryId: notified.id,
      plateNumber: notified.plateNumber,
      phone: notified.phone,
      slotId,
      claimJobId: String(job.id),
      notifiedAt: notified.notifiedAt!,
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

    await this.repo.setConsecutiveMisses(data.consecutiveMissesAtNotify + 1);

    const shiftedPayload: QueueShiftedPayload = {
      entryId: shifted.entry.id,
      plateNumber: shifted.entry.plateNumber,
      shiftDistance,
      newPosition: shifted.newPosition,
      consecutiveMisses: data.consecutiveMissesAtNotify + 1,
      correlationId: data.correlationId,
    };
    this.events.emit(DomainEvents.QueueShifted, shiftedPayload);

    // Notify next for the same slot
    await this.tryNotifyNext(data.slotId, data.correlationId);
  }

  async listQueue(): Promise<unknown[]> {
    const ids = await this.repo.listIds();
    const entries = await Promise.all(ids.map((id) => this.repo.getEntry(id)));
    return entries.filter(Boolean);
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
