import { Module, OnModuleInit } from '@nestjs/common';
import { LprModule } from '../lpr/lpr.module';
import { KioskController } from './kiosk.controller';
import { KioskGateway } from './kiosk.gateway';
import { KioskService } from './kiosk.service';
import { SessionStore } from './session.store';

@Module({
  imports: [LprModule],
  controllers: [KioskController],
  providers: [SessionStore, KioskGateway, KioskService],
  exports: [KioskService, KioskGateway],
})
export class KioskModule implements OnModuleInit {
  constructor(
    private readonly gateway: KioskGateway,
    private readonly service: KioskService,
  ) {}

  onModuleInit(): void {
    this.gateway.bindService(this.service);
  }
}
