import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents } from '../../events/domain-events';
import type {
  KioskIdentityConfirmedPayload,
  KioskPhoneCapturedPayload,
  KioskSessionStartedPayload,
  KioskStaffEscalationPayload,
  SapLookupFoundPayload,
  SapLookupNotFoundPayload,
} from '../../events/domain-events';
import { LprService } from '../lpr/lpr.service';
import { LiveKitService } from '../livekit/livekit.service';
import { KioskGateway } from './kiosk.gateway';
import { SessionStore } from './session.store';
import {
  createNotRecognizedSession,
  createSession,
  handleInput,
  toPublic,
} from './state-machine';
import type { KioskSession, PublicSession, SessionInput } from './state-machine';

@Injectable()
export class KioskService {
  constructor(
    private readonly store: SessionStore,
    private readonly events: DomainEventBus,
    @Inject(forwardRef(() => KioskGateway))
    private readonly gateway: KioskGateway,
    private readonly lpr: LprService,
    private readonly livekit: LiveKitService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(KioskService.name);
  }

  private async enrichPublic(session: KioskSession): Promise<PublicSession> {
    if (!this.livekit.isBeyEnabled()) {
      return toPublic(session, { avatar_adapter: 'canvas' });
    }
    try {
      const join = await this.livekit.ensureRoomAndAgent({
        gateId: session.gateId,
        sessionId: session.sessionId,
      });
      if (join) {
        return toPublic(session, {
          avatar_adapter: 'bey',
          livekit: {
            url: join.url,
            token: join.token,
            room: join.room,
          },
        });
      }
    } catch (err) {
      this.logger.warn({ err }, 'kiosk.livekit.enrich.failed');
    }
    return toPublic(session, { avatar_adapter: 'canvas' });
  }

  private async pushAndSpeak(session: KioskSession): Promise<PublicSession> {
    const pub = await this.enrichPublic(session);
    this.gateway.pushSession(session.gateId, pub);
    if (pub.avatar_adapter === 'bey' && session.lastPromptSpeech) {
      void this.livekit.speak({
        gateId: session.gateId,
        sessionId: session.sessionId,
        text: session.lastPromptSpeech,
        lang: session.lang,
      });
    }
    return pub;
  }

  @OnEvent(DomainEvents.SapLookupFound)
  async onSapFound(payload: SapLookupFoundPayload): Promise<void> {
    const session = createSession({
      sessionId: randomUUID(),
      gateId: payload.gateId,
      profile: payload.profile,
    });
    await this.store.save(session);
    await this.lpr.markActive(
      payload.plateNumber,
      payload.gateId,
      'kiosk_session',
    );

    const started: KioskSessionStartedPayload = {
      sessionId: session.sessionId,
      gateId: session.gateId,
      plateNumber: session.plateNumber,
      profile: session.profile,
      correlationId: payload.correlationId,
    };
    this.events.emit(DomainEvents.KioskSessionStarted, started);

    await this.pushAndSpeak(session);
    this.logger.info(
      { sessionId: session.sessionId, gateId: session.gateId },
      'kiosk.session.started',
    );
  }

  @OnEvent(DomainEvents.SapLookupNotFound)
  async onSapNotFound(payload: SapLookupNotFoundPayload): Promise<void> {
    const session = createNotRecognizedSession({
      sessionId: randomUUID(),
      gateId: payload.gateId,
      plateNumber: payload.plateNumber,
    });
    await this.store.save(session);
    await this.lpr.clearActive(payload.plateNumber);
    await this.pushAndSpeak(session);
    this.logger.info(
      { gateId: payload.gateId, plate: payload.plateNumber },
      'kiosk.not_recognized',
    );
  }

  async getSession(sessionId: string): Promise<PublicSession | null> {
    const session = await this.store.get(sessionId);
    return session ? this.enrichPublic(session) : null;
  }

  async handleSessionInput(
    sessionId: string,
    input: SessionInput,
    correlationId?: string,
  ): Promise<PublicSession | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;

    const outcome = handleInput(session, input);
    await this.store.save(outcome.session);
    const pub = await this.pushAndSpeak(outcome.session);

    if (outcome.kind === 'completed') {
      const base = {
        sessionId: outcome.session.sessionId,
        gateId: outcome.session.gateId,
        plateNumber: outcome.session.plateNumber,
        visitPhone: outcome.visitPhone,
        profile: outcome.session.profile,
        correlationId,
      };
      if (outcome.usedOnFilePhone) {
        const p: KioskIdentityConfirmedPayload = base;
        this.events.emit(DomainEvents.KioskIdentityConfirmed, p);
      } else {
        const p: KioskPhoneCapturedPayload = base;
        this.events.emit(DomainEvents.KioskPhoneCaptured, p);
      }
    } else if (outcome.kind === 'escalated') {
      const p: KioskStaffEscalationPayload = {
        sessionId: outcome.session.sessionId,
        gateId: outcome.session.gateId,
        plateNumber: outcome.session.plateNumber,
        reason: outcome.reason,
        correlationId,
      };
      this.events.emit(DomainEvents.KioskStaffEscalation, p);
      await this.lpr.clearActive(outcome.session.plateNumber);
    }

    return pub;
  }

  /** Manual start for testing without LPR (uses fake profile). */
  async startManual(
    gateId: string,
    correlationId?: string,
  ): Promise<PublicSession> {
    await this.onSapFound({
      gateId: gateId || 'gate-1',
      plateNumber: 'ABC 1234',
      profile: {
        name: 'Ahmed Hassan',
        phone: '0501234567',
        plate: 'ABC 1234',
      },
      correlationId,
    });
    const active = await this.store.getActiveForGate(gateId || 'gate-1');
    if (!active) {
      throw new Error('Failed to create session');
    }
    return this.enrichPublic(active);
  }
}
