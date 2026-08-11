import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
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
import { LiveKitModule } from './modules/livekit/livekit.module';
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
    EventEmitterModule.forRoot({
      wildcard: false,
      ignoreErrors: false,
    }),
    ServeStaticModule.forRoot({
      // nest-cli emits to dist/src/, so __dirname/../public is wrong; cwd is middleware/
      rootPath: join(process.cwd(), 'public'),
      // path-to-regexp v8 (Nest 11 / Express 5): named wildcards only — not `(.*)`
      exclude: [
        '/health/{*any}',
        '/session/{*any}',
        '/queue/{*any}',
        '/slots/{*any}',
        '/lpr/{*any}',
        '/demo/{*any}',
        '/audit/{*any}',
        '/notifications/{*any}',
        '/tts/{*any}',
        '/stt/{*any}',
        '/avatar/{*any}',
        '/socket.io/{*any}',
      ],
    }),
    CommonModule,
    EventsModule,
    RedisModule,
    LprModule,
    SapModule,
    GateModule,
    LiveKitModule,
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
