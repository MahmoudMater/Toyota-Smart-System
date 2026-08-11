import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env.validation';
import { LprModule } from '../lpr/lpr.module';
import { CLAIM_TIMERS_QUEUE } from './claim-timer.types';
import {
  ClaimTimerProcessor,
  QueueEngineService,
} from './queue-engine.service';
import { QueueController } from './queue.controller';
import { QueueRepository } from './queue.repository';
import { SlotsController } from './slots.controller';

@Module({
  imports: [
    LprModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const password = config.get('REDIS_PASSWORD', { infer: true });
        return {
          connection: {
            host: config.get('REDIS_HOST', { infer: true }),
            port: config.get('REDIS_PORT', { infer: true }),
            db: config.get('REDIS_DB', { infer: true }),
            password: password ? password : undefined,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: CLAIM_TIMERS_QUEUE }),
  ],
  controllers: [QueueController, SlotsController],
  providers: [QueueRepository, QueueEngineService, ClaimTimerProcessor],
  exports: [QueueEngineService, QueueRepository],
})
export class QueueEngineModule {}
