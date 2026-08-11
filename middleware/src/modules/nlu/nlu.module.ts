import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { TRANSCRIPT_INTERPRETER } from './transcript.interpreter';
import { RulesNluAdapter } from './rules-nlu.adapter';
import { LlmNluAdapter } from './llm-nlu.adapter';
import { NluService } from './nlu.service';

const transcriptInterpreterProvider: Provider = {
  provide: TRANSCRIPT_INTERPRETER,
  inject: [ConfigService, RulesNluAdapter, LlmNluAdapter],
  useFactory: (
    config: ConfigService<Env, true>,
    rules: RulesNluAdapter,
    llm: LlmNluAdapter,
  ) => (config.get('NLU_ADAPTER', { infer: true }) === 'llm' ? llm : rules),
};

@Module({
  providers: [
    RulesNluAdapter,
    LlmNluAdapter,
    transcriptInterpreterProvider,
    NluService,
  ],
  exports: [NluService],
})
export class NluModule {}
