import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents } from '../../events/domain-events';
import type {
  LprPlateReadPayload,
  SapLookupFoundPayload,
  SapLookupNotFoundPayload,
} from '../../events/domain-events';
import { IntegrationLogService } from '../integration-log/integration-log.service';
import { SAP_CLIENT } from './sap.client';
import type { SapClient } from './sap.client';

@Injectable()
export class SapService {
  constructor(
    @Inject(SAP_CLIENT) private readonly sap: SapClient,
    private readonly events: DomainEventBus,
    private readonly logger: PinoLogger,
    private readonly integrationLog: IntegrationLogService,
  ) {
    this.logger.setContext(SapService.name);
  }

  @OnEvent(DomainEvents.LprPlateRead)
  async onPlateRead(payload: LprPlateReadPayload): Promise<void> {
    const call = this.integrationLog.startCall({
      integration: 'sap',
      op: 'sap.lookupByPlate',
      correlationId: payload.correlationId,
      request: { plate: payload.plateNumber, gateId: payload.gateId },
    });
    const profile = await this.sap.lookupByPlate(payload.plateNumber);
    if (!profile) {
      call.success({
        response: { found: false, plate: payload.plateNumber },
      });
      const notFound: SapLookupNotFoundPayload = {
        gateId: payload.gateId,
        plateNumber: payload.plateNumber,
        correlationId: payload.correlationId,
      };
      this.events.emit(DomainEvents.SapLookupNotFound, notFound);
      return;
    }
    call.success({
      response: {
        found: true,
        plate: profile.plate,
        name: profile.name,
        phone: profile.phone,
      },
    });
    const found: SapLookupFoundPayload = {
      gateId: payload.gateId,
      plateNumber: profile.plate,
      profile,
      correlationId: payload.correlationId,
    };
    this.events.emit(DomainEvents.SapLookupFound, found);
  }
}
