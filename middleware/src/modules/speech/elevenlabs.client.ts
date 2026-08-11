import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';

export const ELEVENLABS_CLIENT = Symbol('ELEVENLABS_CLIENT');

export interface ElevenLabsRequestOptions {
  path: string;
  method?: 'GET' | 'POST';
  body?: BodyInit | null;
  headers?: Record<string, string>;
  contentType?: string;
}

@Injectable()
export class ElevenLabsClient {
  private readonly baseUrl = 'https://api.elevenlabs.io';
  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ElevenLabsClient.name);
    this.apiKey = this.config.get('ELEVENLABS_API_KEY', { infer: true });
  }

  private assertApiKey(): void {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'ELEVENLABS_API_KEY is not configured. Set it in .env or switch to TTS_ADAPTER=stub / STT_ADAPTER=stub.',
      );
    }
  }

  async fetch(options: ElevenLabsRequestOptions): Promise<Response> {
    this.assertApiKey();

    const url = `${this.baseUrl}${options.path}`;
    const method = options.method ?? 'POST';
    const headers: Record<string, string> = {
      'xi-api-key': this.apiKey,
      ...options.headers,
    };
    if (options.contentType) {
      headers['Content-Type'] = options.contentType;
    }

    this.logger.debug({ url, method }, 'elevenlabs.request');

    const res = await globalThis.fetch(url, {
      method,
      headers,
      body: options.body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(
        { status: res.status, url, body: text.slice(0, 500) },
        'elevenlabs.error',
      );
      throw new ServiceUnavailableException(
        `ElevenLabs API ${res.status}: ${text.slice(0, 200)}`,
      );
    }

    return res;
  }
}
