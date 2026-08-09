import { Module } from '@nestjs/common';
import { GATE_CONTROLLER } from './gate.controller.port';
import { GateService } from './gate.service';
import { StubGateAdapter } from './stub-gate.adapter';

@Module({
  providers: [
    GateService,
    { provide: GATE_CONTROLLER, useClass: StubGateAdapter },
  ],
  exports: [GateService, GATE_CONTROLLER],
})
export class GateModule {}
