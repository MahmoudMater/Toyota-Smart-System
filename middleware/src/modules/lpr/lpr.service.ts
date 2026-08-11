import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents, LprPlateReadPayload } from '../../events/domain-events';
import { PlateReadDto } from './dto/plate-read.dto';

const ACTIVE_SESSION_KEY = (plate: string) =>
  `lpr:active:${plate.trim().toUpperCase().replace(/\s+/g, '')}`;

export type PlateActiveReason = 'lpr_dedupe' | 'kiosk_session' | 'queue_enqueued';

const TTL_BY_REASON: Record<PlateActiveReason, number> = {
  lpr_dedupe: 120,
  kiosk_session: 3600,
  queue_enqueued: 86_400,
};

export interface PlateReadResult {
  accepted: boolean;
  reason?: string;
  plateNumber: string;
  gateId: string;
}

@Injectable()
export class LprService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly events: DomainEventBus,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LprService.name);
  }

  async ingest(
    dto: PlateReadDto,
    correlationId?: string,
  ): Promise<PlateReadResult> {
    const plateNumber = dto.plateNumber.trim().toUpperCase();
    const gateId = dto.gateId.trim();
    const key = ACTIVE_SESSION_KEY(plateNumber);

    const existing = await this.redis.get(key);
    if (existing) {
      this.logger.info(
        { plateNumber, gateId, existing },
        'lpr.plate.deduped',
      );
      return {
        accepted: false,
        reason: 'already_queued_or_active',
        plateNumber,
        gateId,
      };
    }

    await this.markActive(plateNumber, gateId, 'lpr_dedupe');

    const payload: LprPlateReadPayload = {
      gateId,
      plateNumber,
      timestamp: dto.timestamp ?? new Date().toISOString(),
      image: dto.image,
      correlationId,
    };
    this.events.emit(DomainEvents.LprPlateRead, payload);
    return { accepted: true, plateNumber, gateId };
  }

  async purge(): Promise<number> {
    let deleted = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'lpr:active:*', 'COUNT', 100);
      cursor = next;
      if (keys.length) deleted += await this.redis.del(...keys);
    } while (cursor !== '0');
    return deleted;
  }

  async clearActive(plateNumber: string): Promise<void> {
    await this.redis.del(ACTIVE_SESSION_KEY(plateNumber));
  }

  async markActive(
    plateNumber: string,
    gateId: string,
    reason: PlateActiveReason = 'lpr_dedupe',
  ): Promise<void> {
    const ttl = TTL_BY_REASON[reason];
    await this.redis.set(
      ACTIVE_SESSION_KEY(plateNumber),
      JSON.stringify({ gateId, reason, at: new Date().toISOString() }),
      'EX',
      ttl,
    );
  }
}
