/** Domain event names — single source of truth for emitters + audit. */
export const DomainEvents = {
  LprPlateRead: 'lpr.plate.read',
  SapLookupFound: 'sap.lookup.found',
  SapLookupNotFound: 'sap.lookup.not_found',
  KioskSessionStarted: 'kiosk.session.started',
  KioskIdentityConfirmed: 'kiosk.identity.confirmed',
  KioskPhoneCaptured: 'kiosk.phone.captured',
  KioskStaffEscalation: 'kiosk.staff.escalation',
  GateOpenCommanded: 'gate.open.commanded',
  GateOpened: 'gate.opened',
  QueueEnqueued: 'queue.enqueued',
  SlotFreed: 'slot.freed',
  QueueNotified: 'queue.notified',
  QueueClaimConfirmed: 'queue.claim.confirmed',
  QueueClaimTimeout: 'queue.claim.timeout',
  QueueShifted: 'queue.shifted',
  QueueAssigned: 'queue.assigned',
} as const;

export type DomainEventName =
  (typeof DomainEvents)[keyof typeof DomainEvents];

export interface ClientProfile {
  name: string;
  phone: string;
  plate: string;
}

export interface LprPlateReadPayload {
  gateId: string;
  plateNumber: string;
  timestamp: string;
  image?: string;
  correlationId?: string;
}

export interface SapLookupFoundPayload {
  gateId: string;
  plateNumber: string;
  profile: ClientProfile;
  correlationId?: string;
}

export interface SapLookupNotFoundPayload {
  gateId: string;
  plateNumber: string;
  correlationId?: string;
}

export interface KioskSessionStartedPayload {
  sessionId: string;
  gateId: string;
  plateNumber: string;
  profile: ClientProfile;
  correlationId?: string;
}

export interface KioskIdentityConfirmedPayload {
  sessionId: string;
  gateId: string;
  plateNumber: string;
  visitPhone: string;
  profile: ClientProfile;
  correlationId?: string;
}

export interface KioskPhoneCapturedPayload {
  sessionId: string;
  gateId: string;
  plateNumber: string;
  visitPhone: string;
  profile: ClientProfile;
  correlationId?: string;
}

export interface KioskStaffEscalationPayload {
  sessionId: string;
  gateId: string;
  plateNumber: string;
  reason: string;
  correlationId?: string;
}

export interface GateOpenCommandedPayload {
  gateId: string;
  sessionId: string;
  plateNumber: string;
  correlationId?: string;
}

export interface GateOpenedPayload {
  gateId: string;
  sessionId: string;
  plateNumber: string;
  correlationId?: string;
}

export interface QueueEnqueuedPayload {
  entryId: string;
  plateNumber: string;
  phone: string;
  gateId: string;
  sessionId: string;
  enqueuedAt: string;
  correlationId?: string;
}

export interface SlotFreedPayload {
  slotId: string;
  freedAt: string;
  correlationId?: string;
}

export interface QueueNotifiedPayload {
  entryId: string;
  plateNumber: string;
  phone: string;
  slotId: string;
  claimJobId: string;
  notifiedAt: string;
  consecutiveMisses: number;
  correlationId?: string;
}

export interface QueueClaimConfirmedPayload {
  entryId: string;
  plateNumber: string;
  slotId: string;
  confirmedAt: string;
  correlationId?: string;
}

export interface QueueClaimTimeoutPayload {
  entryId: string;
  plateNumber: string;
  slotId: string;
  timedOutAt: string;
  shiftDistance: number;
  correlationId?: string;
}

export interface QueueShiftedPayload {
  entryId: string;
  plateNumber: string;
  shiftDistance: number;
  newPosition: number;
  consecutiveMisses: number;
  correlationId?: string;
}

export interface QueueAssignedPayload {
  entryId: string;
  plateNumber: string;
  slotId: string;
  assignedAt: string;
  correlationId?: string;
}
