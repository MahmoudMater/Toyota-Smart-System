import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from './config/config.module';
import { CommonModule } from './common/common.module';
import { EventsModule } from './events/events.module';
import { RedisModule } from './redis/redis.module';
import { LprModule } from './modules/lpr/lpr.module';
import { SapModule } from './modules/sap/sap.module';
import { GateModule } from './modules/gate/gate.module';
import { KioskModule } from './modules/kiosk/kiosk.module';
import { QueueEngineModule } from './modules/queue-engine/queue-engine.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { DemoModule } from './modules/demo/demo.module';
import { TtsModule } from './modules/tts/tts.module';
import { SttModule } from './modules/stt/stt.module';
import { IntegrationLogModule } from './modules/integration-log/integration-log.module';
import { HealthController } from './health.controller';
import { Env } from './config/env.validation';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          transport:
            config.get('NODE_ENV', { infer: true }) !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          autoLogging: true,
          customProps: (req) => ({
            correlationId: req.headers['x-correlation-id'],
          }),
        },
      }),
    }),
    IntegrationLogModule,
    EventEmitterModule.forRoot({
      wildcard: false,
      ignoreErrors: false,
    }),
    CommonModule,
    EventsModule,
    RedisModule,
    LprModule,
    SapModule,
    GateModule,
    KioskModule,
    QueueEngineModule,
    NotificationsModule,
    AuditModule,
    DemoModule,
    TtsModule,
    SttModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
