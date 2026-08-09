export const CLAIM_TIMERS_QUEUE = 'claim-timers';

export interface ClaimTimerJobData {
  entryId: string;
  slotId: string;
  plateNumber: string;
  phone: string;
  consecutiveMissesAtNotify: number;
  correlationId?: string;
}
