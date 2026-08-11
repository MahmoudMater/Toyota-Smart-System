import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { NOTIFICATION_SENDER } from './notification.sender';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { StubNotificationAdapter } from './stub-notification.adapter';

const notificationSenderProvider: Provider = {
  provide: NOTIFICATION_SENDER,
  inject: [ConfigService, StubNotificationAdapter],
  useFactory: (
    config: ConfigService<Env, true>,
    stub: StubNotificationAdapter,
  ) => {
    const adapter = config.get('NOTIFICATION_ADAPTER', { infer: true });
    if (adapter === 'real') {
      throw new Error(
        'NOTIFICATION_ADAPTER=real is configured but no production adapter is built yet',
      );
    }
    return stub;
  },
};

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    StubNotificationAdapter,
    notificationSenderProvider,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
