import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { SpeechModule } from '../speech/speech.module';
import { ElevenLabsTtsAdapter } from './elevenlabs-tts.adapter';
import { SPEECH_SYNTHESIZER } from './speech.synthesizer';
import { StubTtsAdapter } from './stub-tts.adapter';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';

const speechSynthesizerProvider: Provider = {
  provide: SPEECH_SYNTHESIZER,
  inject: [ConfigService, ElevenLabsTtsAdapter, StubTtsAdapter],
  useFactory: (
    config: ConfigService<Env, true>,
    el: ElevenLabsTtsAdapter,
    stub: StubTtsAdapter,
  ) => (config.get('TTS_ADAPTER', { infer: true }) === 'stub' ? stub : el),
};

@Module({
  imports: [SpeechModule],
  controllers: [TtsController],
  providers: [
    ElevenLabsTtsAdapter,
    StubTtsAdapter,
    speechSynthesizerProvider,
    TtsService,
  ],
  exports: [TtsService],
})
export class TtsModule {}
