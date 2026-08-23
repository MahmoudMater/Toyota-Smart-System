/**
 * Pure shift-back helper: after a miss, push the entry `distance` positions
 * further in the list (distance grows 1,2,3… per consecutive miss for a slot).
 * Exported for unit tests.
 */
export function applyShiftBack(
  orderedIds: string[],
  entryId: string,
  shiftDistance: number,
): { next: string[]; newPosition: number } {
  const idx = orderedIds.indexOf(entryId);
  if (idx < 0) {
    return { next: [...orderedIds], newPosition: -1 };
  }
  const without = [...orderedIds.slice(0, idx), ...orderedIds.slice(idx + 1)];
  const insertAt = Math.min(idx + shiftDistance, without.length);
  const next = [
    ...without.slice(0, insertAt),
    entryId,
    ...without.slice(insertAt),
  ];
  return { next, newPosition: insertAt };
}

export function nextShiftDistance(consecutiveMisses: number): number {
  // First miss → push 1; second → 2; etc. consecutiveMisses is count *before* this timeout.
  return consecutiveMisses + 1;
}

export type QueueEntryStatus =
  'waiting' | 'notified' | 'confirmed' | 'skipped' | 'parked' | 'assigned';

export interface QueueEntry {
  id: string;
  plateNumber: string;
  phone: string;
  gateId: string;
  sessionId: string;
  enqueuedAt: string;
  status: QueueEntryStatus;
  notifiedAt: string | null;
  notifyAttemptCount: number;
  consecutiveMisses: number;
  slotId: string | null;
  claimJobId: string | null;
  confirmed: boolean;
}

export const QUEUE_LIST_KEY = 'qms:queue';
export const QUEUE_ENTRY_KEY = (id: string) => `qms:entry:${id}`;
export const QUEUE_PLATE_KEY = (plate: string) =>
  `qms:plate:${plate.trim().toUpperCase().replace(/\s+/g, '')}`;
/** Per-slot active claim (allows N concurrent notifies for N free slots). */
export const QUEUE_CLAIM_KEY = (slotId: string) => `qms:claim:${slotId.trim()}`;
export const QUEUE_CLAIM_PATTERN = 'qms:claim:*';
/** Consecutive no-shows for a given slot fill cycle; resets on confirm. */
export const QUEUE_CONSECUTIVE_MISSES_KEY = (slotId: string) =>
  `qms:slot:${slotId.trim()}:consecutive_misses`;
/** Short lock so parallel slot-frees don't double-claim the same queue entry. */
export const QUEUE_NOTIFY_LOCK_KEY = 'qms:notify_lock';
export const SLOTS_AVAILABLE_KEY = 'slots:available';
