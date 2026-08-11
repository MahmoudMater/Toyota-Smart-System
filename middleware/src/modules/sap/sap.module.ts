import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { FakeSapAdapter } from './fake-sap.adapter';
import { SAP_CLIENT } from './sap.client';
import { SapService } from './sap.service';

const sapClientProvider: Provider = {
  provide: SAP_CLIENT,
  inject: [ConfigService, FakeSapAdapter],
  useFactory: (config: ConfigService<Env, true>, fake: FakeSapAdapter) => {
    const adapter = config.get('SAP_ADAPTER', { infer: true });
    if (adapter === 'http') {
      throw new Error(
        'SAP_ADAPTER=http is configured but no production adapter is built yet',
      );
    }
    return fake;
  },
};

@Module({
  providers: [SapService, FakeSapAdapter, sapClientProvider],
  exports: [SAP_CLIENT, SapService],
})
export class SapModule {}
