import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { SpeechModule } from '../speech/speech.module';
import { ElevenLabsSttAdapter } from './elevenlabs-stt.adapter';
import { SPEECH_TRANSCRIBER } from './speech.transcriber';
import { SttController } from './stt.controller';
import { SttService } from './stt.service';
import { StubSttAdapter } from './stub-stt.adapter';

const speechTranscriberProvider: Provider = {
  provide: SPEECH_TRANSCRIBER,
  inject: [ConfigService, ElevenLabsSttAdapter, StubSttAdapter],
  useFactory: (
    config: ConfigService<Env, true>,
    el: ElevenLabsSttAdapter,
    stub: StubSttAdapter,
  ) => (config.get('STT_ADAPTER', { infer: true }) === 'stub' ? stub : el),
};

@Module({
  imports: [SpeechModule],
  controllers: [SttController],
  providers: [
    ElevenLabsSttAdapter,
    StubSttAdapter,
    speechTranscriberProvider,
    SttService,
  ],
  exports: [SttService],
})
export class SttModule {}
