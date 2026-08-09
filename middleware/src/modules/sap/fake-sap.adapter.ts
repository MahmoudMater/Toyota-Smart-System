import { Injectable } from '@nestjs/common';
import { ClientProfile } from '../../events/domain-events';
import { SapClient } from './sap.client';

const FAKE_DIRECTORY: Record<string, ClientProfile> = {
  'ABC 1234': {
    name: 'Ahmed Hassan',
    phone: '0501234567',
    plate: 'ABC 1234',
  },
  ABC1234: {
    name: 'Ahmed Hassan',
    phone: '0501234567',
    plate: 'ABC 1234',
  },
};

@Injectable()
export class FakeSapAdapter implements SapClient {
  async lookupByPlate(plateNumber: string): Promise<ClientProfile | null> {
    const key = plateNumber.trim().toUpperCase();
    const spaced = key.replace(/\s+/g, ' ');
    const compact = spaced.replace(/\s/g, '');
    return (
      FAKE_DIRECTORY[spaced] ??
      FAKE_DIRECTORY[compact] ??
      FAKE_DIRECTORY[key] ??
      null
    );
  }
}
