import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { GATE_CONTROLLER } from './gate.controller.port';
import { GateService } from './gate.service';
import { StubGateAdapter } from './stub-gate.adapter';

const gateControllerProvider: Provider = {
  provide: GATE_CONTROLLER,
  inject: [ConfigService, StubGateAdapter],
  useFactory: (config: ConfigService<Env, true>, stub: StubGateAdapter) => {
    const adapter = config.get('GATE_ADAPTER', { infer: true });
    if (adapter === 'real') {
      throw new Error(
        'GATE_ADAPTER=real is configured but no production adapter is built yet',
      );
    }
    return stub;
  },
};

@Module({
  providers: [GateService, StubGateAdapter, gateControllerProvider],
  exports: [GateService, GATE_CONTROLLER],
})
export class GateModule {}
