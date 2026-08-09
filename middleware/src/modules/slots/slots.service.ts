import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents, SlotFreedPayload } from '../../events/domain-events';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { QueueEngineService } from '../queue-engine/queue-engine.service';
import { SLOTS_AVAILABLE_KEY } from '../queue-engine/queue.logic';
import {
  FreedBatchDto,
  SetAvailableSlotsDto,
  SlotFreedDto,
} from './dto/slot-freed.dto';

@Injectable()
export class SlotsService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly events: DomainEventBus,
    private readonly queueEngine: QueueEngineService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SlotsService.name);
  }

  async getAvailable(): Promise<{
    available: number;
    activeClaims: Awaited<ReturnType<QueueEngineService['listActiveClaims']>>;
  }> {
    const raw = await this.redis.get(SLOTS_AVAILABLE_KEY);
    const available = raw ? Number(raw) : 0;
    const activeClaims = await this.queueEngine.listActiveClaims();
    return {
      available: Number.isFinite(available) ? available : 0,
      activeClaims,
    };
  }

  async setAvailable(dto: SetAvailableSlotsDto): Promise<{ available: number }> {
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
    // Notify directly (no @OnEvent) so batch frees don't double-fire.
    void this.queueEngine.tryNotifyNext(payload.slotId, correlationId);
    return payload;
  }

  /**
   * Free N slots and notify up to N waiting customers (one claim per slot).
   * Uses stored available count when `count` is omitted.
   */
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
      const ok = await this.queueEngine.tryNotifyNext(slotId, correlationId);
      if (ok) notified += 1;
      slots.push({ slotId, notified: ok });
    }

    const remaining = Math.max(0, stored.available - requested);
    await this.redis.set(SLOTS_AVAILABLE_KEY, String(remaining));

    this.logger.info(
      { requested, notified, remaining },
      'slots.freed_batch',
    );
    return { requested, notified, slots, available: remaining };
  }
}
