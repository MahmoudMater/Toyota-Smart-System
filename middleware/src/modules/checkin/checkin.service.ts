import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents } from '../../events/domain-events';
import type { ClientProfile } from '../../events/domain-events';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { GateService } from '../gate/gate.service';
import { LprService } from '../lpr/lpr.service';
import { parseRegions, validatePhone } from '../nlu/phone';
import { QueueEngineService } from '../queue-engine/queue-engine.service';
import {
  normalizeGate,
  normalizePlate,
  resolveSubmitPlate,
} from './checkin.logic';
import type {
  CheckinDisplay,
  CheckinSubmitInput,
  CheckinSubmitResult,
  CheckinTicket,
  CheckinTicketSource,
  CheckinTicketView,
} from './checkin.types';

const ticketKey = (token: string) => `checkin:ticket:${token}`;
const gateKey = (gateId: string) => `checkin:gate:${gateId}`;
const plateHintKey = (gateId: string) => `checkin:gate:${gateId}:plate`;
const openKey = (gateId: string) => `checkin:gate:open:${gateId}`;

@Injectable()
export class CheckinService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly events: DomainEventBus,
    private readonly queue: QueueEngineService,
    private readonly gate: GateService,
    private readonly lpr: LprService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CheckinService.name);
  }

  private ttlSeconds(): number {
    return this.config.get('CHECKIN_TOKEN_TTL_SECONDS', { infer: true });
  }

  private rateLimitSeconds(): number {
    return this.config.get('GATE_OPEN_RATE_LIMIT_SECONDS', { infer: true });
  }

  private publicBase(): string {
    return this.config
      .get('CHECKIN_PUBLIC_BASE_URL', { infer: true })
      .replace(/\/$/, '');
  }

  private genericUrl(gateId: string): string {
    return `${this.publicBase()}?gate=${encodeURIComponent(gateId)}`;
  }

  private tokenUrl(gateId: string, token: string): string {
    return `${this.genericUrl(gateId)}&t=${encodeURIComponent(token)}`;
  }

  genericDisplay(gateId: string): CheckinDisplay {
    const g = normalizeGate(gateId);
    return {
      mode: 'generic',
      gateId: g,
      checkinUrl: this.genericUrl(g),
    };
  }

  async getDisplay(gateId: string): Promise<CheckinDisplay> {
    const g = normalizeGate(gateId);
    const token = await this.redis.get(gateKey(g));
    if (!token) return this.genericDisplay(g);
    const ticket = await this.loadTicket(token);
    if (!ticket) {
      await this.redis.del(gateKey(g));
      return this.genericDisplay(g);
    }
    return this.displayForTicket(ticket);
  }

  async getTicket(
    token: string,
    gateIdHint?: string,
  ): Promise<CheckinTicketView> {
    const ticket = await this.loadTicket(token.trim());
    if (!ticket) {
      const gateId = normalizeGate(gateIdHint || '');
      const plateHint = gateId
        ? await this.redis.get(plateHintKey(gateId))
        : null;
      throw new GoneException({
        message: 'checkin_token_expired',
        gateId: gateId || undefined,
        plateNumber: plateHint || undefined,
      });
    }
    const ttl = await this.redis.ttl(ticketKey(ticket.token));
    return {
      token: ticket.token,
      gateId: ticket.gateId,
      plateNumber: ticket.plateNumber,
      name: ticket.name,
      phone: ticket.phone,
      plateLocked: ticket.plateLocked,
      source: ticket.source,
      expiresAt: new Date(Date.now() + Math.max(ttl, 0) * 1000).toISOString(),
    };
  }

  async mintFromSap(params: {
    gateId: string;
    plateNumber: string;
    profile: ClientProfile;
    correlationId?: string;
  }): Promise<CheckinDisplay> {
    return this.mintTicket({
      gateId: params.gateId,
      plateNumber: params.plateNumber,
      name: params.profile.name,
      phone: params.profile.phone,
      plateLocked: true,
      source: 'sap',
      correlationId: params.correlationId,
    });
  }

  async mintFromLpr(params: {
    gateId: string;
    plateNumber: string;
    correlationId?: string;
  }): Promise<CheckinDisplay> {
    return this.mintTicket({
      gateId: params.gateId,
      plateNumber: params.plateNumber,
      name: '',
      phone: '',
      plateLocked: false,
      source: 'lpr',
      correlationId: params.correlationId,
    });
  }

  async submit(input: CheckinSubmitInput): Promise<CheckinSubmitResult> {
    const gateId = normalizeGate(input.gateId);
    const name = input.name.trim();
    if (!name) throw new BadRequestException('name_required');

    const regions = parseRegions(
      this.config.get('PHONE_REGIONS', { infer: true }),
    );
    const phoneResult = validatePhone(input.phone, regions);
    if (!phoneResult.valid || !phoneResult.local) {
      throw new BadRequestException('invalid_phone');
    }
    const visitPhone = phoneResult.local;

    let plateNumber = normalizePlate(input.plateNumber);
    let sessionId = `checkin:${randomUUID()}`;
    let ticket: CheckinTicket | null = null;

    if (input.token?.trim()) {
      ticket = await this.loadTicket(input.token.trim());
      if (!ticket) {
        throw new GoneException({
          message: 'checkin_token_expired',
          gateId,
          plateNumber: (await this.redis.get(plateHintKey(gateId))) || undefined,
        });
      }
      if (normalizeGate(ticket.gateId) !== gateId) {
        throw new BadRequestException('gate_mismatch');
      }
      plateNumber = resolveSubmitPlate({
        clientPlate: input.plateNumber,
        ticketPlate: ticket.plateNumber,
        plateLocked: ticket.plateLocked,
      });
      sessionId = `checkin:${ticket.token}`;
    }

    if (!plateNumber) throw new BadRequestException('plate_required');

    const profile: ClientProfile = {
      name,
      phone: visitPhone,
      plate: plateNumber,
    };

    const { created, entry } = await this.queue.enqueueFromCheckin({
      plateNumber,
      phone: visitPhone,
      gateId,
      sessionId,
      correlationId: input.correlationId,
    });

    if (!created) {
      throw new ConflictException('already_queued');
    }

    if (ticket) {
      await this.consumeTicket(ticket);
    }

    const gateOpened = await this.tryOpenGate({
      gateId,
      sessionId,
      plateNumber,
      correlationId: input.correlationId,
    });

    this.events.emit(DomainEvents.CheckinSubmitted, {
      sessionId,
      gateId,
      plateNumber,
      visitPhone,
      profile,
      gateOpened,
      correlationId: input.correlationId,
    });

    await this.broadcastDisplay({
      mode: 'submitted',
      gateId,
      checkinUrl: this.genericUrl(gateId),
      plateNumber,
      customerName: name,
    });

    // After a short submitted flash, kiosk should show generic again on next join;
    // clear token mapping so getDisplay is generic.
    await this.redis.del(gateKey(gateId));

    this.logger.info(
      { entryId: entry.id, plateNumber, gateId, gateOpened },
      'checkin.submitted',
    );

    return {
      entryId: entry.id,
      plateNumber,
      gateOpened,
    };
  }

  async purge(): Promise<number> {
    let deleted = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'checkin:*',
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length) deleted += await this.redis.del(...keys);
    } while (cursor !== '0');
    return deleted;
  }

  private async mintTicket(params: {
    gateId: string;
    plateNumber: string;
    name: string;
    phone: string;
    plateLocked: boolean;
    source: CheckinTicketSource;
    correlationId?: string;
  }): Promise<CheckinDisplay> {
    const gateId = normalizeGate(params.gateId);
    const plateNumber = normalizePlate(params.plateNumber);
    const ttl = this.ttlSeconds();
    const token = randomBytes(24).toString('base64url');
    const ticket: CheckinTicket = {
      token,
      gateId,
      plateNumber,
      name: params.name.trim(),
      phone: params.phone.trim(),
      plateLocked: params.plateLocked,
      source: params.source,
      createdAt: new Date().toISOString(),
    };

    const previous = await this.redis.get(gateKey(gateId));
    const pipe = this.redis.pipeline();
    if (previous) pipe.del(ticketKey(previous));
    pipe.set(ticketKey(token), JSON.stringify(ticket), 'EX', ttl);
    pipe.set(gateKey(gateId), token, 'EX', ttl);
    pipe.set(plateHintKey(gateId), plateNumber, 'EX', ttl);
    await pipe.exec();

    await this.lpr.markActive(plateNumber, gateId, 'checkin_pending');

    const display = this.displayForTicket(ticket, ttl);
    await this.broadcastDisplay(display);
    this.logger.info(
      {
        gateId,
        plateNumber,
        source: params.source,
        correlationId: params.correlationId,
      },
      'checkin.ticket.minted',
    );
    return display;
  }

  private displayForTicket(
    ticket: CheckinTicket,
    ttlSeconds?: number,
  ): CheckinDisplay {
    const ttl = ttlSeconds ?? this.ttlSeconds();
    return {
      mode: ticket.source === 'sap' ? 'sap' : 'lpr',
      gateId: ticket.gateId,
      checkinUrl: this.tokenUrl(ticket.gateId, ticket.token),
      customerName: ticket.name || undefined,
      plateNumber: ticket.plateNumber,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      token: ticket.token,
    };
  }

  private async loadTicket(token: string): Promise<CheckinTicket | null> {
    if (!token) return null;
    const raw = await this.redis.get(ticketKey(token));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CheckinTicket;
    } catch {
      return null;
    }
  }

  private async consumeTicket(ticket: CheckinTicket): Promise<void> {
    const pipe = this.redis.pipeline();
    pipe.del(ticketKey(ticket.token));
    pipe.del(gateKey(ticket.gateId));
    await pipe.exec();
  }

  private async tryOpenGate(params: {
    gateId: string;
    sessionId: string;
    plateNumber: string;
    correlationId?: string;
  }): Promise<boolean> {
    const acquired = await this.redis.set(
      openKey(params.gateId),
      '1',
      'EX',
      this.rateLimitSeconds(),
      'NX',
    );
    if (acquired !== 'OK') {
      this.logger.info(
        { gateId: params.gateId, plateNumber: params.plateNumber },
        'checkin.gate.rate_limited',
      );
      return false;
    }
    await this.gate.openForVisit(params);
    return true;
  }

  private async broadcastDisplay(display: CheckinDisplay): Promise<void> {
    this.events.emit(DomainEvents.CheckinDisplayUpdated, display);
  }
}
