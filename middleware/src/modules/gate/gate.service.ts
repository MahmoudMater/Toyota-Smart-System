import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents } from '../../events/domain-events';
import type {
  GateOpenCommandedPayload,
  GateOpenedPayload,
  KioskIdentityConfirmedPayload,
  KioskPhoneCapturedPayload,
} from '../../events/domain-events';
import { GATE_CONTROLLER } from './gate.controller.port';
import type { GateControllerPort } from './gate.controller.port';

@Injectable()
export class GateService {
  constructor(
    @Inject(GATE_CONTROLLER) private readonly gate: GateControllerPort,
    private readonly events: DomainEventBus,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GateService.name);
  }

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

  private async openForVisit(
    payload: KioskIdentityConfirmedPayload | KioskPhoneCapturedPayload,
  ): Promise<void> {
    const commanded: GateOpenCommandedPayload = {
      gateId: payload.gateId,
      sessionId: payload.sessionId,
      plateNumber: payload.plateNumber,
      correlationId: payload.correlationId,
    };
    this.events.emit(DomainEvents.GateOpenCommanded, commanded);
    await this.gate.openGate(payload.gateId);
    const opened: GateOpenedPayload = {
      gateId: payload.gateId,
      sessionId: payload.sessionId,
      plateNumber: payload.plateNumber,
      correlationId: payload.correlationId,
    };
    this.events.emit(DomainEvents.GateOpened, opened);
    this.logger.info(
      { gateId: payload.gateId, sessionId: payload.sessionId },
      'gate.opened',
    );
  }
}
