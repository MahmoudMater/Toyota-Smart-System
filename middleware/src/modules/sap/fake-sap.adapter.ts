import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import type { ClientProfile } from '../../events/domain-events';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { SapClient } from './sap.client';

export const DEMO_SAP_KEY = (plate: string) =>
  `demo:sap:${plate.trim().toUpperCase().replace(/\s+/g, '')}`;

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
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async lookupByPlate(plateNumber: string): Promise<ClientProfile | null> {
    const key = plateNumber.trim().toUpperCase();
    const spaced = key.replace(/\s+/g, ' ');
    const compact = spaced.replace(/\s/g, '');

    // Demo overrides (set via POST /demo/sap-profile) win over hardcoded directory.
    const override =
      (await this.redis.get(DEMO_SAP_KEY(spaced))) ??
      (await this.redis.get(DEMO_SAP_KEY(compact)));
    if (override) {
      try {
        return JSON.parse(override) as ClientProfile;
      } catch {
        /* fall through */
      }
    }

    return (
      FAKE_DIRECTORY[spaced] ??
      FAKE_DIRECTORY[compact] ??
      FAKE_DIRECTORY[key] ??
      null
    );
  }
}
