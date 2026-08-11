import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { SpeechSynthesizer, SynthesizeResult } from './speech.synthesizer';
import { SPEECH_SYNTHESIZER } from './speech.synthesizer';

const CACHE_PREFIX = 'tts:cache:';

@Injectable()
export class TtsService {
  constructor(
    @Inject(SPEECH_SYNTHESIZER) private readonly synthesizer: SpeechSynthesizer,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TtsService.name);
  }

  get adapterName(): string {
    return this.synthesizer.adapterName;
  }

  private cacheKey(text: string, lang: string): string {
    const voiceId = this.config.get('ELEVENLABS_TTS_VOICE_ID', { infer: true });
    const modelId = this.config.get('ELEVENLABS_TTS_MODEL_ID', { infer: true });
    const format = this.config.get('ELEVENLABS_TTS_OUTPUT_FORMAT', {
      infer: true,
    });
    const hash = createHash('sha256')
      .update(`${voiceId}|${modelId}|${format}|${lang}|${text}`)
      .digest('hex');
    return `${CACHE_PREFIX}${hash}`;
  }

  private cacheTtl(): number {
    return this.config.get('TTS_CACHE_TTL_SECONDS', { infer: true });
  }

  async synthesize(
    text: string,
    lang: string,
  ): Promise<SynthesizeResult> {
    if (!text || !text.trim()) {
      throw new Error('text must be non-empty');
    }
    const trimmed = text.trim();
    const key = this.cacheKey(trimmed, lang);

    const cached = await this.redis.getBuffer(key);
    if (cached) {
      this.logger.debug({ key, bytes: cached.length }, 'tts.cache.hit');
      const format = this.config.get('ELEVENLABS_TTS_OUTPUT_FORMAT', {
        infer: true,
      });
      const contentType = format.startsWith('wav')
        ? 'audio/wav'
        : 'audio/mpeg';
      return { audio: cached, contentType };
    }

    const result = await this.synthesizer.synthesize(trimmed, lang);
    await this.redis.set(key, result.audio, 'EX', this.cacheTtl());
    this.logger.debug(
      { key, bytes: result.audio.length },
      'tts.cache.miss.stored',
    );
    return result;
  }

  async purge(): Promise<number> {
    let deleted = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${CACHE_PREFIX}*`,
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length) deleted += await this.redis.del(...keys);
    } while (cursor !== '0');
    return deleted;
  }
}
