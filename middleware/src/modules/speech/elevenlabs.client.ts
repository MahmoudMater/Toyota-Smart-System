import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';
import { IntegrationLogService } from '../integration-log/integration-log.service';

export const ELEVENLABS_CLIENT = Symbol('ELEVENLABS_CLIENT');

export interface ElevenLabsRequestOptions {
  path: string;
  method?: 'GET' | 'POST';
  body?: BodyInit | null;
  headers?: Record<string, string>;
  contentType?: string;
  /** High-level op name for integration logs (e.g. tts.synthesize). */
  op?: string;
  /** Structured request metadata (text preview, voice, etc.). */
  meta?: Record<string, unknown>;
}

const MAX_ATTEMPTS = 4;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBody(status: number, body: string): boolean {
  if (status === 429) return true;
  if (!RETRYABLE_STATUSES.has(status)) return false;
  // Don't retry hard auth / payment errors that sometimes arrive as 503 wrappers.
  if (/payment_required|unauthorized|invalid_api_key/i.test(body)) return false;
  return true;
}

@Injectable()
export class ElevenLabsClient {
  private readonly baseUrl = 'https://api.elevenlabs.io';
  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
    private readonly integrationLog: IntegrationLogService,
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

    let lastErrorText = '';
    let lastStatus = 0;
    const op = options.op ?? 'elevenlabs.fetch';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const call = this.integrationLog.startCall({
        integration: 'elevenlabs',
        op,
        method,
        url,
        attempt,
        request: options.meta,
      });

      const res = await globalThis.fetch(url, {
        method,
        headers,
        body: options.body,
      });

      if (res.ok) {
        call.success({ status: res.status });
        return res;
      }

      const text = await res.text().catch(() => '');
      lastStatus = res.status;
      lastErrorText = text;
      const retryable =
        attempt < MAX_ATTEMPTS && isRetryableBody(res.status, text);

      call.failure({
        status: res.status,
        error: `HTTP ${res.status}`,
        body: text.slice(0, 500),
      });

      if (!retryable) break;

      // 429 system_busy: back off ~0.8s, 1.6s, 3.2s (+ jitter)
      const delayMs = Math.round(
        800 * 2 ** (attempt - 1) + Math.random() * 200,
      );
      call.retry({ attempt, delayMs, status: res.status });
      await sleep(delayMs);
    }

    throw new ServiceUnavailableException(
      `ElevenLabs API ${lastStatus}: ${lastErrorText.slice(0, 200)}`,
    );
  }
}
