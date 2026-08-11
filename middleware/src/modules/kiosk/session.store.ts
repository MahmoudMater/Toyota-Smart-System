import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Env } from '../../config/env.validation';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { KioskSession } from './state-machine';

const sessionKey = (id: string) => `kiosk:session:${id}`;
const gateActiveKey = (gateId: string) => `kiosk:gate:${gateId}:active`;

@Injectable()
export class SessionStore {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private ttl(): number {
    return this.config.get('SESSION_TTL_SECONDS', { infer: true });
  }

  async save(session: KioskSession): Promise<void> {
    const ttl = this.ttl();
    const pipe = this.redis.pipeline();
    pipe.set(sessionKey(session.sessionId), JSON.stringify(session), 'EX', ttl);
    pipe.set(gateActiveKey(session.gateId), session.sessionId, 'EX', ttl);
    await pipe.exec();
  }

  async get(sessionId: string): Promise<KioskSession | null> {
    const raw = await this.redis.get(sessionKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as KioskSession;
  }

  async purge(): Promise<number> {
    let deleted = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'kiosk:*', 'COUNT', 100);
      cursor = next;
      if (keys.length) deleted += await this.redis.del(...keys);
    } while (cursor !== '0');
    return deleted;
  }

  async getActiveForGate(gateId: string): Promise<KioskSession | null> {
    const sessionId = await this.redis.get(gateActiveKey(gateId));
    if (!sessionId) return null;
    return this.get(sessionId);
  }
}
