import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents } from '../../events/domain-events';
import type {
  GateEventPayload,
  KioskIdentityConfirmedPayload,
  KioskPhoneCapturedPayload,
} from '../../events/domain-events';
import { IntegrationLogService } from '../integration-log/integration-log.service';
import { GATE_CONTROLLER } from './gate.controller.port';
import type { GateControllerPort } from './gate.controller.port';

@Injectable()
export class GateService {
  constructor(
    @Inject(GATE_CONTROLLER) private readonly gate: GateControllerPort,
    private readonly events: DomainEventBus,
    private readonly logger: PinoLogger,
    private readonly integrationLog: IntegrationLogService,
  ) {
    this.logger.setContext(GateService.name);
  }

  /** Voice console path — open on identity confirm / phone capture. */
  @OnEvent(DomainEvents.KioskIdentityConfirmed)
  async onIdentityConfirmed(
    payload: KioskIdentityConfirmedPayload,
  ): Promise<void> {
    await this.openForVisit(payload);
  }

  @OnEvent(DomainEvents.KioskPhoneCaptured)
  async onPhoneCaptured(payload: KioskPhoneCapturedPayload): Promise<void> {
    await this.openForVisit(payload);
  }

  /** Shared open — also called by check-in after rate-limit acquire. */
  async openForVisit(payload: {
    gateId: string;
    sessionId: string;
    plateNumber: string;
    correlationId?: string;
  }): Promise<void> {
    const gatePayload: GateEventPayload = {
      gateId: payload.gateId,
      sessionId: payload.sessionId,
      plateNumber: payload.plateNumber,
      correlationId: payload.correlationId,
    };
    this.events.emit(DomainEvents.GateOpenCommanded, gatePayload);
    await this.gate.openGate(payload.gateId);
    this.events.emit(DomainEvents.GateOpened, gatePayload);
    this.integrationLog.event(
      'gate',
      'gate.opened',
      {
        gateId: payload.gateId,
        sessionId: payload.sessionId,
        plateNumber: payload.plateNumber,
      },
      payload.correlationId,
    );
    this.logger.info(
      { gateId: payload.gateId, plateNumber: payload.plateNumber },
      'gate.opened',
    );
  }
}
