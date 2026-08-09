import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents } from '../../events/domain-events';
import type {
  LprPlateReadPayload,
  SapLookupFoundPayload,
  SapLookupNotFoundPayload,
} from '../../events/domain-events';
import { Inject } from '@nestjs/common';
import { SAP_CLIENT } from './sap.client';
import type { SapClient } from './sap.client';

@Injectable()
export class SapService {
  constructor(
    @Inject(SAP_CLIENT) private readonly sap: SapClient,
    private readonly events: DomainEventBus,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SapService.name);
  }

  @OnEvent(DomainEvents.LprPlateRead)
  async onPlateRead(payload: LprPlateReadPayload): Promise<void> {
    this.logger.info(
      { plate: payload.plateNumber, gateId: payload.gateId },
      'sap.lookup.start',
    );
    const profile = await this.sap.lookupByPlate(payload.plateNumber);
    if (!profile) {
      const notFound: SapLookupNotFoundPayload = {
        gateId: payload.gateId,
        plateNumber: payload.plateNumber,
        correlationId: payload.correlationId,
      };
      this.events.emit(DomainEvents.SapLookupNotFound, notFound);
      return;
    }
    const found: SapLookupFoundPayload = {
      gateId: payload.gateId,
      plateNumber: profile.plate,
      profile,
      correlationId: payload.correlationId,
    };
    this.events.emit(DomainEvents.SapLookupFound, found);
  }
}
