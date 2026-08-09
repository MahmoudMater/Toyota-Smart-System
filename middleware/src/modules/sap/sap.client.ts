import { ClientProfile } from '../../events/domain-events';

export const SAP_CLIENT = Symbol('SAP_CLIENT');

export interface SapClient {
  lookupByPlate(plateNumber: string): Promise<ClientProfile | null>;
}
