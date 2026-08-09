import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  NotificationSender,
  NotifyRequest,
} from './notification.sender';

@Injectable()
export class StubNotificationAdapter implements NotificationSender {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(StubNotificationAdapter.name);
  }

  async notify(request: NotifyRequest): Promise<void> {
    this.logger.info(
      {
        entryId: request.entryId,
        phone: request.phone,
        plate: request.plateNumber,
        slotId: request.slotId,
        channels: request.channels,
      },
      'notification.stub.send',
    );
  }
}
