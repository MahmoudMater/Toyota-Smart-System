import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { GateControllerPort } from './gate.controller.port';

@Injectable()
export class StubGateAdapter implements GateControllerPort {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(StubGateAdapter.name);
  }

  async openGate(gateId: string): Promise<void> {
    this.logger.info({ gateId }, 'gate.open.stub');
  }
}
