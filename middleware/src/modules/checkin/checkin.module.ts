import { Module } from '@nestjs/common';
import { GateModule } from '../gate/gate.module';
import { LprModule } from '../lpr/lpr.module';
import { QueueEngineModule } from '../queue-engine/queue-engine.module';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';

@Module({
  imports: [QueueEngineModule, GateModule, LprModule],
  controllers: [CheckinController],
  providers: [CheckinService],
  exports: [CheckinService],
})
export class CheckinModule {}
