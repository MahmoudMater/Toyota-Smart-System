import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents, LprPlateReadPayload } from '../../events/domain-events';
import { PlateReadDto } from './dto/plate-read.dto';

const ACTIVE_SESSION_KEY = (plate: string) =>
  `lpr:active:${plate.trim().toUpperCase().replace(/\s+/g, '')}`;
const DEDUPE_TTL_SECONDS = 120;

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

    // Mark plate active until session completes / fails (also cleared on enqueue path).
    await this.redis.set(
      key,
      JSON.stringify({ gateId, at: new Date().toISOString() }),
      'EX',
      DEDUPE_TTL_SECONDS,
    );

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

  async clearActive(plateNumber: string): Promise<void> {
    await this.redis.del(ACTIVE_SESSION_KEY(plateNumber));
  }

  async markActive(plateNumber: string, gateId: string, ttlSeconds = 3600): Promise<void> {
    await this.redis.set(
      ACTIVE_SESSION_KEY(plateNumber),
      JSON.stringify({ gateId, at: new Date().toISOString() }),
      'EX',
      ttlSeconds,
    );
  }
}
