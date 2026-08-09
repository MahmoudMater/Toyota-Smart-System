import { Module } from '@nestjs/common';
import { NOTIFICATION_SENDER } from './notification.sender';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { StubNotificationAdapter } from './stub-notification.adapter';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_SENDER, useClass: StubNotificationAdapter },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
