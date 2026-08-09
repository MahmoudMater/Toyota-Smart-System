import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import { DomainEventName } from './domain-events';

/**
 * Thin wrapper so every domain emit is logged ("the talking").
 * AuditModule still listens via EventEmitter2 wildcards.
 */
@Injectable()
export class DomainEventBus {
  constructor(
    private readonly emitter: EventEmitter2,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DomainEventBus.name);
  }

  emit<T extends object>(event: DomainEventName, payload: T): boolean {
    this.logger.info({ event, payload }, 'domain.event.emit');
    return this.emitter.emit(event, payload);
  }
}
