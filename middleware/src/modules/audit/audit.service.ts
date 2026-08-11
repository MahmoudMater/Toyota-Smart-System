import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { DomainEvents } from '../../events/domain-events';

export const AUDIT_STREAM_KEY = 'audit:events';

@Injectable()
export class AuditService implements OnModuleInit {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly emitter: EventEmitter2,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditService.name);
  }

  onModuleInit(): void {
    const names = Object.values(DomainEvents);
    for (const event of names) {
      this.emitter.on(event, (payload: unknown) => {
        void this.append(event, payload);
      });
    }
    this.logger.info(
      { events: names.length, stream: AUDIT_STREAM_KEY },
      'audit.subscribed',
    );
  }

  async append(event: string, payload: unknown): Promise<void> {
    try {
      const id = await this.redis.xadd(
        AUDIT_STREAM_KEY,
        '*',
        'event',
        event,
        'payload',
        JSON.stringify(payload ?? {}),
        'at',
        new Date().toISOString(),
      );
      this.logger.debug({ event, id }, 'audit.appended');
    } catch (err) {
      this.logger.error(
        { event, err: err instanceof Error ? err.message : String(err) },
        'audit.append.failed',
      );
    }
  }

  async purge(): Promise<number> {
    const exists = await this.redis.exists(AUDIT_STREAM_KEY);
    if (exists) {
      await this.redis.del(AUDIT_STREAM_KEY);
      return 1;
    }
    return 0;
  }

  async recent(count = 50): Promise<
    Array<{ id: string; event: string; payload: unknown; at: string }>
  > {
    const rows = await this.redis.xrevrange(
      AUDIT_STREAM_KEY,
      '+',
      '-',
      'COUNT',
      count,
    );
    return rows.map(([id, fields]) => {
      const map: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        map[fields[i]] = fields[i + 1];
      }
      let payload: unknown = map.payload;
      try {
        payload = JSON.parse(map.payload);
      } catch {
        /* keep raw */
      }
      return { id, event: map.event, payload, at: map.at };
    });
  }
}
