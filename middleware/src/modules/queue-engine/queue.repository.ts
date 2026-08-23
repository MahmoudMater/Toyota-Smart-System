import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  applyShiftBack,
  QUEUE_CLAIM_KEY,
  QUEUE_CLAIM_PATTERN,
  QUEUE_CONSECUTIVE_MISSES_KEY,
  QUEUE_ENTRY_KEY,
  QUEUE_LIST_KEY,
  QUEUE_NOTIFY_LOCK_KEY,
  QUEUE_PLATE_KEY,
  QueueEntry,
  SLOTS_AVAILABLE_KEY,
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

export interface ActiveClaim {
  entryId: string;
  slotId: string;
  claimJobId: string;
}

export interface ReservationResult {
  entry: QueueEntry;
  consecutiveMisses: number;
}

@Injectable()
export class QueueRepository {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Atomically reserve the next waiting entry for a slot.
   * Handles locking, double-check, peek, and marking — callers
   * only need to supply the claimJobId after scheduling the timer.
   */
  async reserveNextForSlot(
    slotId: string,
    claimJobId: string,
    lockRetries = 20,
    lockTtlMs = 2000,
  ): Promise<ReservationResult | null> {
    const existing = await this.getActiveClaim(slotId);
    if (existing) return null;

    let locked = false;
    for (let i = 0; i < lockRetries; i++) {
      locked = await this.acquireNotifyLock(lockTtlMs);
      if (locked) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    if (!locked) return null;

    try {
      if (await this.getActiveClaim(slotId)) return null;

      const next = await this.peekWaiting();
      if (!next) return null;

      const consecutiveMisses = await this.getConsecutiveMisses(slotId);
      const notified = await this.markNotified(next, slotId, claimJobId);
      return { entry: notified, consecutiveMisses };
    } finally {
      await this.releaseNotifyLock();
    }
  }

  /**
   * Confirm a claim and remove the entry from the queue atomically.
   * Returns the assigned entry or null if the claim was stale.
   */
  async confirmAndAssign(
    entryId: string,
    slotId: string,
  ): Promise<{ entry: QueueEntry; claim: ActiveClaim } | null> {
    const claim = await this.getActiveClaim(slotId);
    if (!claim || claim.entryId !== entryId) return null;

    await this.markConfirmed(entryId);
    const assigned = await this.assignAndRemove(entryId);
    if (!assigned) return null;
    return { entry: assigned, claim };
  }

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

  async getActiveClaim(slotId: string): Promise<ActiveClaim | null> {
    const raw = await this.redis.get(QUEUE_CLAIM_KEY(slotId));
    if (!raw) return null;
    return JSON.parse(raw) as ActiveClaim;
  }

  async listActiveClaims(): Promise<ActiveClaim[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, found] = await this.redis.scan(
        cursor,
        'MATCH',
        QUEUE_CLAIM_PATTERN,
        'COUNT',
        50,
      );
      cursor = next;
      keys.push(...found);
    } while (cursor !== '0');

    const claims: ActiveClaim[] = [];
    for (const key of keys) {
      const raw = await this.redis.get(key);
      if (!raw) continue;
      try {
        claims.push(JSON.parse(raw) as ActiveClaim);
      } catch {
        /* skip */
      }
    }
    return claims;
  }

  async setActiveClaim(
    claim: ActiveClaim | null,
    slotId?: string,
  ): Promise<void> {
    if (!claim) {
      const sid = slotId;
      if (!sid) return;
      await this.redis.del(QUEUE_CLAIM_KEY(sid));
      return;
    }
    await this.redis.set(QUEUE_CLAIM_KEY(claim.slotId), JSON.stringify(claim));
  }

  async getConsecutiveMisses(slotId: string): Promise<number> {
    const v = await this.redis.get(QUEUE_CONSECUTIVE_MISSES_KEY(slotId));
    return v ? Number(v) : 0;
  }

  async setConsecutiveMisses(slotId: string, n: number): Promise<void> {
    await this.redis.set(QUEUE_CONSECUTIVE_MISSES_KEY(slotId), String(n));
  }

  /** Acquire a short lock for notify reservation (returns true if acquired). */
  async acquireNotifyLock(ttlMs = 3000): Promise<boolean> {
    const result = await this.redis.set(
      QUEUE_NOTIFY_LOCK_KEY,
      '1',
      'PX',
      ttlMs,
      'NX',
    );
    return result === 'OK';
  }

  async releaseNotifyLock(): Promise<void> {
    await this.redis.del(QUEUE_NOTIFY_LOCK_KEY);
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
    const slotId = entry.slotId;
    entry.status = 'assigned';
    await this.saveEntry(entry);
    await this.redis.lrem(QUEUE_LIST_KEY, 1, entryId);
    await this.redis.del(QUEUE_PLATE_KEY(entry.plateNumber));
    if (slotId) {
      await this.setActiveClaim(null, slotId);
      await this.setConsecutiveMisses(slotId, 0);
    }
    return entry;
  }

  async purge(): Promise<number> {
    let deleted = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'qms:*',
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length) deleted += await this.redis.del(...keys);
    } while (cursor !== '0');
    // Also clear slots:available since it's part of queue accounting
    const slotsDel = await this.redis.del(SLOTS_AVAILABLE_KEY);
    return deleted + slotsDel;
  }

  async shiftBack(
    entryId: string,
    shiftDistance: number,
  ): Promise<{
    entry: QueueEntry;
    newPosition: number;
    slotId: string | null;
  } | null> {
    const entry = await this.getEntry(entryId);
    if (!entry) return null;
    const slotId = entry.slotId;
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
    if (slotId) {
      pipe.del(QUEUE_CLAIM_KEY(slotId));
    }
    await pipe.exec();
    return { entry, newPosition, slotId };
  }
}
