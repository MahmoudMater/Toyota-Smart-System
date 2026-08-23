import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DomainEvents } from '../../events/domain-events';
import type {
  QueueClaimConfirmedPayload,
  QueueNotifiedPayload,
} from '../../events/domain-events';
import { IntegrationLogService } from '../integration-log/integration-log.service';
import { NOTIFICATION_SENDER } from './notification.sender';
import type { NotificationSender } from './notification.sender';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATION_SENDER) private readonly sender: NotificationSender,
    private readonly events: DomainEventBus,
    private readonly logger: PinoLogger,
    private readonly integrationLog: IntegrationLogService,
  ) {
    this.logger.setContext(NotificationsService.name);
  }

  @OnEvent(DomainEvents.QueueNotified)
  async onNotified(payload: QueueNotifiedPayload): Promise<void> {
    await this.sender.notify({
      entryId: payload.entryId,
      phone: payload.phone,
      plateNumber: payload.plateNumber,
      slotId: payload.slotId,
      channels: ['whatsapp', 'sms', 'app'],
    });
  }

  /** WhatsApp confirmation is the source of truth. */
  confirmViaWhatsApp(params: {
    entryId: string;
    slotId: string;
    plateNumber: string;
    correlationId?: string;
  }): void {
    const payload: QueueClaimConfirmedPayload = {
      entryId: params.entryId,
      plateNumber: params.plateNumber,
      slotId: params.slotId,

      confirmedAt: new Date().toISOString(),
      correlationId: params.correlationId,
    };
    this.integrationLog.event(
      'notifications',
      'notification.whatsapp.confirmed',
      {
        entryId: payload.entryId,
        plateNumber: payload.plateNumber,
        slotId: payload.slotId,
        confirmedAt: payload.confirmedAt,
      },
      params.correlationId,
    );
    this.events.emit(DomainEvents.QueueClaimConfirmed, payload);
  }
}
