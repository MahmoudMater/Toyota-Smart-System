import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { IntegrationLogService } from '../integration-log/integration-log.service';
import { GateControllerPort } from './gate.controller.port';

@Injectable()
export class StubGateAdapter implements GateControllerPort {
  constructor(
    private readonly logger: PinoLogger,
    private readonly integrationLog: IntegrationLogService,
  ) {
    this.logger.setContext(StubGateAdapter.name);
  }

  openGate(gateId: string): Promise<void> {
    this.integrationLog.event('gate', 'gate.open.stub', { gateId });
    return Promise.resolve();
  }
}
