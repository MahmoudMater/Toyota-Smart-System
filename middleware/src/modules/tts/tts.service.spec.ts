import { TtsService } from './tts.service';
import type { SpeechSynthesizer, SynthesizeResult } from './speech.synthesizer';

const STUB_AUDIO = Buffer.from('fake-audio-data');

class FakeSynthesizer implements SpeechSynthesizer {
  readonly adapterName = 'fake';
  callCount = 0;

  async synthesize(_text: string, _lang: string): Promise<SynthesizeResult> {
    this.callCount++;
    return { audio: STUB_AUDIO, contentType: 'audio/mpeg' };
  }
}

class FakeRedis {
  private store = new Map<string, { value: Buffer; ttl: number }>();

  async getBuffer(key: string): Promise<Buffer | null> {
    const entry = this.store.get(key);
    return entry?.value ?? null;
  }

  async set(key: string, value: Buffer, _ex: string, ttl: number) {
    this.store.set(key, { value, ttl });
  }

  async scan(
    cursor: string,
    _match: string,
    pattern: string,
    _count: string,
    _n: number,
  ): Promise<[string, string[]]> {
    const prefix = pattern.replace('*', '');
    const keys = [...this.store.keys()].filter((k) => k.startsWith(prefix));
    return ['0', keys];
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }
}

function fakeConfig() {
  const vals: Record<string, unknown> = {
    ELEVENLABS_TTS_VOICE_ID: 'test-voice',
    ELEVENLABS_TTS_MODEL_ID: 'test-model',
    ELEVENLABS_TTS_OUTPUT_FORMAT: 'mp3_44100_128',
    TTS_CACHE_TTL_SECONDS: 3600,
  };
  return { get: (key: string) => vals[key] } as any;
}

function fakeLogger() {
  return { setContext: jest.fn(), debug: jest.fn(), info: jest.fn() } as any;
}

function fakeIntegrationLog() {
  return {
    event: jest.fn(),
    startCall: jest.fn(() => ({
      success: jest.fn(),
      failure: jest.fn(),
      retry: jest.fn(),
    })),
  } as any;
}

function createService() {
  const synth = new FakeSynthesizer();
  const stub = new FakeSynthesizer() as any;
  const redis = new FakeRedis();
  const service = new TtsService(
    synth,
    stub,
    redis as any,
    fakeConfig(),
    fakeLogger(),
    fakeIntegrationLog(),
  );
  return { service, synth, redis };
}

describe('TtsService', () => {
  it('rejects empty text', async () => {
    const { service } = createService();
    await expect(service.synthesize('', 'en')).rejects.toThrow(
      'text must be non-empty',
    );
  });

  it('calls synthesizer on cache miss', async () => {
    const { service, synth } = createService();
    const result = await service.synthesize('hello', 'en');
    expect(synth.callCount).toBe(1);
    expect(result.audio).toEqual(STUB_AUDIO);
  });

  it('returns cached audio on cache hit', async () => {
    const { service, synth } = createService();
    await service.synthesize('hello', 'en');
    await service.synthesize('hello', 'en');
    expect(synth.callCount).toBe(1);
  });

  it('purge clears tts:cache:* keys', async () => {
    const { service, redis } = createService();
    await service.synthesize('hello', 'en');
    const deleted = await service.purge();
    expect(deleted).toBe(1);
    const again = await redis.getBuffer('tts:cache:anything');
    expect(again).toBeNull();
  });

  it('reports adapter name', () => {
    const { service } = createService();
    expect(service.adapterName).toBe('fake');
  });
});
