import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents, SlotFreedPayload } from '../../events/domain-events';
import { SlotFreedDto } from './dto/slot-freed.dto';

@Injectable()
export class SlotsService {
  constructor(
    private readonly events: DomainEventBus,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SlotsService.name);
  }

  freed(dto: SlotFreedDto, correlationId?: string): SlotFreedPayload {
    const payload: SlotFreedPayload = {
      slotId: dto.slotId,
      freedAt: dto.freedAt ?? new Date().toISOString(),
      correlationId,
    };
    this.logger.info(payload, 'slot.freed.ingest');
    this.events.emit(DomainEvents.SlotFreed, payload);
    return payload;
  }
}
