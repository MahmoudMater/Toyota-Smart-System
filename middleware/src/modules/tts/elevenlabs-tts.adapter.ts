import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';
import { ElevenLabsClient } from '../speech/elevenlabs.client';
import type { SpeechSynthesizer, SynthesizeResult } from './speech.synthesizer';

const FORMAT_TO_CONTENT_TYPE: Record<string, string> = {
  mp3_44100_128: 'audio/mpeg',
  mp3_44100_192: 'audio/mpeg',
  mp3_44100_64: 'audio/mpeg',
  mp3_44100_32: 'audio/mpeg',
  mp3_22050_32: 'audio/mpeg',
  mp3_44100_96: 'audio/mpeg',
  mp3_24000_48: 'audio/mpeg',
  wav_44100: 'audio/wav',
  wav_22050: 'audio/wav',
  wav_16000: 'audio/wav',
  pcm_16000: 'audio/pcm',
  pcm_22050: 'audio/pcm',
  pcm_24000: 'audio/pcm',
  pcm_44100: 'audio/pcm',
};

@Injectable()
export class ElevenLabsTtsAdapter implements SpeechSynthesizer {
  readonly adapterName = 'elevenlabs';

  private readonly voiceId: string;
  private readonly modelId: string;
  private readonly outputFormat: string;

  constructor(
    private readonly client: ElevenLabsClient,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ElevenLabsTtsAdapter.name);
    this.voiceId = this.config.get('ELEVENLABS_TTS_VOICE_ID', { infer: true });
    this.modelId = this.config.get('ELEVENLABS_TTS_MODEL_ID', { infer: true });
    this.outputFormat = this.config.get('ELEVENLABS_TTS_OUTPUT_FORMAT', {
      infer: true,
    });
  }

  async synthesize(text: string, lang: string): Promise<SynthesizeResult> {
    const body: Record<string, unknown> = {
      text,
      model_id: this.modelId,
    };
    if (lang && lang !== 'en') {
      body.language_code = lang;
    }

    const res = await this.client.fetch({
      path: `/v1/text-to-speech/${this.voiceId}?output_format=${this.outputFormat}`,
      method: 'POST',
      body: JSON.stringify(body),
      contentType: 'application/json',
    });

    const arrayBuffer = await res.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);
    const contentType =
      FORMAT_TO_CONTENT_TYPE[this.outputFormat] ?? 'audio/mpeg';

    this.logger.debug(
      { bytes: audio.length, lang, format: this.outputFormat },
      'tts.elevenlabs.synthesized',
    );

    return { audio, contentType };
  }
}
