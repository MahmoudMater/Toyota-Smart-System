import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import type { DomainEventMap, DomainEventName } from './domain-events';

@Injectable()
export class DomainEventBus {
  constructor(
    private readonly emitter: EventEmitter2,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DomainEventBus.name);
  }

  emit<E extends DomainEventName>(
    event: E,
    payload: E extends keyof DomainEventMap ? DomainEventMap[E] : object,
  ): boolean {
    this.logger.info({ event, payload }, 'domain.event.emit');
    return this.emitter.emit(event, payload);
  }
}
