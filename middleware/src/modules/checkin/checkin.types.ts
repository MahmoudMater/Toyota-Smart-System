import type { CheckinDisplayPayload } from '../../events/domain-events';

export type CheckinTicketSource = 'sap' | 'lpr' | 'generic';

export interface CheckinTicket {
  token: string;
  gateId: string;
  plateNumber: string;
  name: string;
  phone: string;
  plateLocked: boolean;
  source: CheckinTicketSource;
  createdAt: string;
}

export type CheckinDisplay = CheckinDisplayPayload;

export interface CheckinTicketView {
  token: string;
  gateId: string;
  plateNumber: string;
  name: string;
  phone: string;
  plateLocked: boolean;
  source: CheckinTicketSource;
  expiresAt: string;
}

export interface CheckinSubmitInput {
  token?: string;
  gateId: string;
  plateNumber: string;
  name: string;
  phone: string;
  correlationId?: string;
}

export interface CheckinSubmitResult {
  entryId: string;
  plateNumber: string;
  gateOpened: boolean;
}
