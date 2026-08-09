import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';
import type { ClientProfile } from '../../events/domain-events';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  AUDIT_STREAM_KEY,
  DEMO_KEY_PATTERNS,
  DEMO_SAP_KEY,
} from './demo.keys';
import type { SapProfileDto } from './dto/sap-profile.dto';

@Injectable()
export class DemoService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DemoService.name);
  }

  async saveSapProfile(dto: SapProfileDto): Promise<ClientProfile> {
    const plate = dto.plateNumber.trim().toUpperCase().replace(/\s+/g, ' ');
    const profile: ClientProfile = {
      name: dto.name.trim(),
      phone: dto.phone.trim(),
      plate,
    };
    await this.redis.set(DEMO_SAP_KEY(plate), JSON.stringify(profile));
    this.logger.info({ plate, name: profile.name }, 'demo.sap_profile.saved');
    return profile;
  }

  async getSapProfile(plateNumber: string): Promise<ClientProfile | null> {
    const raw = await this.redis.get(DEMO_SAP_KEY(plateNumber));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ClientProfile;
    } catch {
      return null;
    }
  }

  getConfig(): { claimTimeoutMs: number } {
    return {
      claimTimeoutMs: this.config.get('CLAIM_TIMEOUT_MS', { infer: true }),
    };
  }

  async reset(): Promise<{ deleted: number }> {
    let deleted = 0;
    for (const pattern of DEMO_KEY_PATTERNS) {
      deleted += await this.deleteByPattern(pattern);
    }
    // Clear audit stream
    const auditExists = await this.redis.exists(AUDIT_STREAM_KEY);
    if (auditExists) {
      await this.redis.del(AUDIT_STREAM_KEY);
      deleted += 1;
    }
    this.logger.info({ deleted }, 'demo.reset');
    return { deleted };
  }

  private async deleteByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let count = 0;
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length) {
        count += await this.redis.del(...keys);
      }
    } while (cursor !== '0');
    return count;
  }
}
