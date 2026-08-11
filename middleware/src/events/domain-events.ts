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

/* ─── Shared base ─── */

export interface BaseDomainPayload {
  correlationId?: string;
}

export interface ClientProfile {
  name: string;
  phone: string;
  plate: string;
}

/* ─── Per-event payloads ─── */

export interface LprPlateReadPayload extends BaseDomainPayload {
  gateId: string;
  plateNumber: string;
  timestamp: string;
  image?: string;
}

export interface SapLookupFoundPayload extends BaseDomainPayload {
  gateId: string;
  plateNumber: string;
  profile: ClientProfile;
}

export interface SapLookupNotFoundPayload extends BaseDomainPayload {
  gateId: string;
  plateNumber: string;
}

export interface KioskSessionStartedPayload extends BaseDomainPayload {
  sessionId: string;
  gateId: string;
  plateNumber: string;
  profile: ClientProfile;
}

export interface KioskIdentityConfirmedPayload extends BaseDomainPayload {
  sessionId: string;
  gateId: string;
  plateNumber: string;
  visitPhone: string;
  profile: ClientProfile;
}

export interface KioskPhoneCapturedPayload extends BaseDomainPayload {
  sessionId: string;
  gateId: string;
  plateNumber: string;
  visitPhone: string;
  profile: ClientProfile;
}

export interface KioskStaffEscalationPayload extends BaseDomainPayload {
  sessionId: string;
  gateId: string;
  plateNumber: string;
  reason: string;
}

export interface GateEventPayload extends BaseDomainPayload {
  gateId: string;
  sessionId: string;
  plateNumber: string;
}

/** @deprecated Use GateEventPayload */
export type GateOpenCommandedPayload = GateEventPayload;
/** @deprecated Use GateEventPayload */
export type GateOpenedPayload = GateEventPayload;

export interface QueueEnqueuedPayload extends BaseDomainPayload {
  entryId: string;
  plateNumber: string;
  phone: string;
  gateId: string;
  sessionId: string;
  enqueuedAt: string;
}

export interface SlotFreedPayload extends BaseDomainPayload {
  slotId: string;
  freedAt: string;
}

export interface QueueNotifiedPayload extends BaseDomainPayload {
  entryId: string;
  plateNumber: string;
  phone: string;
  slotId: string;
  claimJobId: string;
  notifiedAt: string;
  consecutiveMisses: number;
}

export interface QueueClaimConfirmedPayload extends BaseDomainPayload {
  entryId: string;
  plateNumber: string;
  slotId: string;
  confirmedAt: string;
}

export interface QueueClaimTimeoutPayload extends BaseDomainPayload {
  entryId: string;
  plateNumber: string;
  slotId: string;
  timedOutAt: string;
  shiftDistance: number;
}

export interface QueueShiftedPayload extends BaseDomainPayload {
  entryId: string;
  plateNumber: string;
  shiftDistance: number;
  newPosition: number;
  consecutiveMisses: number;
}

export interface QueueAssignedPayload extends BaseDomainPayload {
  entryId: string;
  plateNumber: string;
  slotId: string;
  assignedAt: string;
}

/* ─── Typed event map for compile-time safety ─── */

export interface DomainEventMap {
  [DomainEvents.LprPlateRead]: LprPlateReadPayload;
  [DomainEvents.SapLookupFound]: SapLookupFoundPayload;
  [DomainEvents.SapLookupNotFound]: SapLookupNotFoundPayload;
  [DomainEvents.KioskSessionStarted]: KioskSessionStartedPayload;
  [DomainEvents.KioskIdentityConfirmed]: KioskIdentityConfirmedPayload;
  [DomainEvents.KioskPhoneCaptured]: KioskPhoneCapturedPayload;
  [DomainEvents.KioskStaffEscalation]: KioskStaffEscalationPayload;
  [DomainEvents.GateOpenCommanded]: GateEventPayload;
  [DomainEvents.GateOpened]: GateEventPayload;
  [DomainEvents.QueueEnqueued]: QueueEnqueuedPayload;
  [DomainEvents.SlotFreed]: SlotFreedPayload;
  [DomainEvents.QueueNotified]: QueueNotifiedPayload;
  [DomainEvents.QueueClaimConfirmed]: QueueClaimConfirmedPayload;
  [DomainEvents.QueueClaimTimeout]: QueueClaimTimeoutPayload;
  [DomainEvents.QueueShifted]: QueueShiftedPayload;
  [DomainEvents.QueueAssigned]: QueueAssignedPayload;
}
