import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  applyShiftBack,
  QUEUE_ACTIVE_CLAIM_KEY,
  QUEUE_CONSECUTIVE_MISSES_KEY,
  QUEUE_ENTRY_KEY,
  QUEUE_LIST_KEY,
  QUEUE_PLATE_KEY,
  QueueEntry,
} from './queue.logic';

const ENQUEUE_LUA = `
local plateKey = KEYS[1]
local listKey = KEYS[2]
local entryKey = KEYS[3]
local entryId = ARGV[1]
local entryJson = ARGV[2]
if redis.call('EXISTS', plateKey) == 1 then
  return {0, redis.call('GET', plateKey)}
end
redis.call('SET', plateKey, entryId)
redis.call('SET', entryKey, entryJson)
redis.call('RPUSH', listKey, entryId)
return {1, entryId}
`;

@Injectable()
export class QueueRepository {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async enqueue(params: {
    plateNumber: string;
    phone: string;
    gateId: string;
    sessionId: string;
  }): Promise<{ created: boolean; entry: QueueEntry }> {
    const id = randomUUID();
    const entry: QueueEntry = {
      id,
      plateNumber: params.plateNumber,
      phone: params.phone,
      gateId: params.gateId,
      sessionId: params.sessionId,
      enqueuedAt: new Date().toISOString(),
      status: 'waiting',
      notifiedAt: null,
      notifyAttemptCount: 0,
      consecutiveMisses: 0,
      slotId: null,
      claimJobId: null,
      confirmed: false,
    };

    const result = (await this.redis.eval(
      ENQUEUE_LUA,
      3,
      QUEUE_PLATE_KEY(params.plateNumber),
      QUEUE_LIST_KEY,
      QUEUE_ENTRY_KEY(id),
      id,
      JSON.stringify(entry),
    )) as [number, string];

    if (result[0] === 0) {
      const existing = await this.getEntry(result[1]);
      if (existing) {
        return { created: false, entry: existing };
      }
    }
    return { created: true, entry };
  }

  async getEntry(id: string): Promise<QueueEntry | null> {
    const raw = await this.redis.get(QUEUE_ENTRY_KEY(id));
    if (!raw) return null;
    return JSON.parse(raw) as QueueEntry;
  }

  async saveEntry(entry: QueueEntry): Promise<void> {
    await this.redis.set(QUEUE_ENTRY_KEY(entry.id), JSON.stringify(entry));
  }

  async listIds(): Promise<string[]> {
    return this.redis.lrange(QUEUE_LIST_KEY, 0, -1);
  }

  async peekWaiting(): Promise<QueueEntry | null> {
    const ids = await this.listIds();
    for (const id of ids) {
      const entry = await this.getEntry(id);
      if (entry && (entry.status === 'waiting' || entry.status === 'skipped')) {
        return entry;
      }
    }
    return null;
  }

  async getActiveClaim(): Promise<{
    entryId: string;
    slotId: string;
    claimJobId: string;
  } | null> {
    const raw = await this.redis.get(QUEUE_ACTIVE_CLAIM_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      entryId: string;
      slotId: string;
      claimJobId: string;
    };
  }

  async setActiveClaim(
    claim: { entryId: string; slotId: string; claimJobId: string } | null,
  ): Promise<void> {
    if (!claim) {
      await this.redis.del(QUEUE_ACTIVE_CLAIM_KEY);
      return;
    }
    await this.redis.set(QUEUE_ACTIVE_CLAIM_KEY, JSON.stringify(claim));
  }

  async getConsecutiveMisses(): Promise<number> {
    const v = await this.redis.get(QUEUE_CONSECUTIVE_MISSES_KEY);
    return v ? Number(v) : 0;
  }

  async setConsecutiveMisses(n: number): Promise<void> {
    await this.redis.set(QUEUE_CONSECUTIVE_MISSES_KEY, String(n));
  }

  async markNotified(
    entry: QueueEntry,
    slotId: string,
    claimJobId: string,
  ): Promise<QueueEntry> {
    entry.status = 'notified';
    entry.notifiedAt = new Date().toISOString();
    entry.notifyAttemptCount += 1;
    entry.slotId = slotId;
    entry.claimJobId = claimJobId;
    entry.confirmed = false;
    await this.saveEntry(entry);
    await this.setActiveClaim({
      entryId: entry.id,
      slotId,
      claimJobId,
    });
    return entry;
  }

  async markConfirmed(entryId: string): Promise<QueueEntry | null> {
    const entry = await this.getEntry(entryId);
    if (!entry) return null;
    entry.confirmed = true;
    entry.status = 'confirmed';
    await this.saveEntry(entry);
    return entry;
  }

  async assignAndRemove(entryId: string): Promise<QueueEntry | null> {
    const entry = await this.getEntry(entryId);
    if (!entry) return null;
    entry.status = 'assigned';
    await this.saveEntry(entry);
    await this.redis.lrem(QUEUE_LIST_KEY, 1, entryId);
    await this.redis.del(QUEUE_PLATE_KEY(entry.plateNumber));
    await this.setActiveClaim(null);
    await this.setConsecutiveMisses(0);
    return entry;
  }

  async shiftBack(
    entryId: string,
    shiftDistance: number,
  ): Promise<{ entry: QueueEntry; newPosition: number } | null> {
    const entry = await this.getEntry(entryId);
    if (!entry) return null;
    const ids = await this.listIds();
    const { next, newPosition } = applyShiftBack(ids, entryId, shiftDistance);
    const pipe = this.redis.pipeline();
    pipe.del(QUEUE_LIST_KEY);
    if (next.length) {
      pipe.rpush(QUEUE_LIST_KEY, ...next);
    }
    entry.status = 'skipped';
    entry.slotId = null;
    entry.claimJobId = null;
    entry.confirmed = false;
    entry.consecutiveMisses += 1;
    pipe.set(QUEUE_ENTRY_KEY(entry.id), JSON.stringify(entry));
    pipe.del(QUEUE_ACTIVE_CLAIM_KEY);
    await pipe.exec();
    return { entry, newPosition };
  }
}
