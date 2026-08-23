import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { IntegrationLogService } from '../integration-log/integration-log.service';
import { NotificationSender, NotifyRequest } from './notification.sender';

@Injectable()
export class StubNotificationAdapter implements NotificationSender {
  constructor(
    private readonly logger: PinoLogger,
    private readonly integrationLog: IntegrationLogService,
  ) {
    this.logger.setContext(StubNotificationAdapter.name);
  }

  notify(request: NotifyRequest): Promise<void> {
    this.integrationLog.event('notifications', 'notification.stub.send', {
      entryId: request.entryId,
      phone: request.phone,
      plate: request.plateNumber,
      slotId: request.slotId,
      channels: request.channels,
    });
    return Promise.resolve();
  }
}
