import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CheckinModule } from '../checkin/checkin.module';
import { KioskModule } from '../kiosk/kiosk.module';
import { LprModule } from '../lpr/lpr.module';
import { QueueEngineModule } from '../queue-engine/queue-engine.module';
import { TtsModule } from '../tts/tts.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [
    QueueEngineModule,
    KioskModule,
    LprModule,
    CheckinModule,
    AuditModule,
    TtsModule,
  ],
  controllers: [DemoController],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
