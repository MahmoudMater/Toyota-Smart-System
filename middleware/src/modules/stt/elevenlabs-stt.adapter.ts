import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';
import { ElevenLabsClient } from '../speech/elevenlabs.client';
import { IntegrationLogService } from '../integration-log/integration-log.service';
import type { SpeechTranscriber, TranscribeResult } from './speech.transcriber';

@Injectable()
export class ElevenLabsSttAdapter implements SpeechTranscriber {
  readonly adapterName = 'elevenlabs';

  private readonly modelId: string;

  constructor(
    private readonly client: ElevenLabsClient,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
    private readonly integrationLog: IntegrationLogService,
  ) {
    this.logger.setContext(ElevenLabsSttAdapter.name);
    this.modelId = this.config.get('ELEVENLABS_STT_MODEL_ID', { infer: true });
  }

  async transcribe(
    audioBuffer: Buffer,
    filename: string,
    lang?: string,
  ): Promise<TranscribeResult> {
    this.integrationLog.event('elevenlabs', 'stt.elevenlabs.call', {
      modelId: this.modelId,
      filename,
      bytes: audioBuffer.length,
      lang: lang ?? null,
    });

    const form = new FormData();
    form.append('model_id', this.modelId);
    const ab = new ArrayBuffer(audioBuffer.byteLength);
    new Uint8Array(ab).set(
      new Uint8Array(
        audioBuffer.buffer,
        audioBuffer.byteOffset,
        audioBuffer.byteLength,
      ),
    );
    form.append('file', new Blob([ab]), filename);
    if (lang) {
      form.append('language_code', lang);
    }

    const res = await this.client.fetch({
      path: '/v1/speech-to-text',
      method: 'POST',
      body: form,
      op: 'stt.transcribe',
      meta: {
        modelId: this.modelId,
        filename,
        bytes: audioBuffer.length,
        lang: lang ?? null,
      },
    });

    const data = (await res.json()) as { text?: string };
    const text = (data.text ?? '').trim();

    this.integrationLog.event('elevenlabs', 'stt.elevenlabs.transcribed', {
      bytes: audioBuffer.length,
      lang: lang ?? null,
      textLen: text.length,
      text,
    });
    this.integrationLog.event('stt', 'stt.transcribed', {
      textLen: text.length,
      text,
      lang: lang ?? null,
    });

    return { text };
  }
}
