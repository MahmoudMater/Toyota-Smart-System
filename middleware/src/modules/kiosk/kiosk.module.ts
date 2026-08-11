import { Module } from '@nestjs/common';
import { LprModule } from '../lpr/lpr.module';
import { KioskController } from './kiosk.controller';
import { KioskGateway } from './kiosk.gateway';
import { KioskService } from './kiosk.service';
import { SessionStore } from './session.store';

@Module({
  imports: [LprModule],
  controllers: [KioskController],
  providers: [SessionStore, KioskGateway, KioskService],
  exports: [KioskService, KioskGateway, SessionStore],
})
export class KioskModule {}
