import { Module } from '@nestjs/common';
import { ElevenLabsClient } from './elevenlabs.client';

@Module({
  providers: [ElevenLabsClient],
  exports: [ElevenLabsClient],
})
export class SpeechModule {}
