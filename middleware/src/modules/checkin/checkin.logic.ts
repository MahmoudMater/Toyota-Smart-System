/**
 * Pure helpers covered by unit tests — mirrors CheckinService Redis key + lock rules.
 */

export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function normalizeGate(gateId: string): string {
  return gateId.trim() || 'gate-1';
}

export function resolveSubmitPlate(params: {
  clientPlate: string;
  ticketPlate?: string;
  plateLocked?: boolean;
}): string {
  if (params.plateLocked && params.ticketPlate) {
    return normalizePlate(params.ticketPlate);
  }
  return normalizePlate(params.clientPlate);
}

export const CHECKIN_KEYS = {
  ticket: (token: string) => `checkin:ticket:${token}`,
  gate: (gateId: string) => `checkin:gate:${gateId}`,
  plateHint: (gateId: string) => `checkin:gate:${gateId}:plate`,
  openRate: (gateId: string) => `checkin:gate:open:${gateId}`,
};
