import { Module } from '@nestjs/common';
import { FakeSapAdapter } from './fake-sap.adapter';
import { SAP_CLIENT } from './sap.client';
import { SapService } from './sap.service';

@Module({
  providers: [
    SapService,
    { provide: SAP_CLIENT, useClass: FakeSapAdapter },
  ],
  exports: [SAP_CLIENT, SapService],
})
export class SapModule {}
