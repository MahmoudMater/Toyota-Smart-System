import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LOG_LEVEL: z.string().default('info'),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().default(0),
  CLAIM_TIMEOUT_MS: z.coerce.number().default(50_000),
  SESSION_TTL_SECONDS: z.coerce.number().default(1800),
  SAP_ADAPTER: z.enum(['fake', 'http']).default('fake'),
  SAP_BASE_URL: z.string().optional().default(''),
  GATE_ADAPTER: z.enum(['stub', 'real']).default('stub'),
  NOTIFICATION_ADAPTER: z.enum(['stub', 'real']).default('stub'),
  TTS_ADAPTER: z.enum(['elevenlabs', 'stub']).default('elevenlabs'),
  STT_ADAPTER: z.enum(['elevenlabs', 'stub']).default('elevenlabs'),
  ELEVENLABS_API_KEY: z.string().optional().default(''),
  ELEVENLABS_TTS_VOICE_ID: z.string().optional().default(''),
  ELEVENLABS_TTS_MODEL_ID: z.string().default('eleven_multilingual_v2'),
  ELEVENLABS_TTS_OUTPUT_FORMAT: z.string().default('mp3_44100_128'),
  ELEVENLABS_STT_MODEL_ID: z.string().default('scribe_v1'),
  TTS_CACHE_TTL_SECONDS: z.coerce.number().default(86_400),
  CORS_ORIGINS: z
    .string()
    .default(
      'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001',
    ),
  CHECKIN_PUBLIC_BASE_URL: z
    .string()
    .default('http://127.0.0.1:3001/checkin'),
  CHECKIN_TOKEN_TTL_SECONDS: z.coerce.number().default(180),
  GATE_OPEN_RATE_LIMIT_SECONDS: z.coerce.number().default(30),

  // NLU (transcript interpretation)
  NLU_ADAPTER: z.enum(['rules', 'llm']).default('rules'),
  NLU_BASE_URL: z.string().default('http://127.0.0.1:11434/v1'),
  // 0.6b: latency-first for realtime sockets; confirm step covers misses.
  NLU_MODEL: z.string().default('qwen3:0.6b'),
  NLU_API_KEY: z.string().optional().default(''),
  // Fail fast to rules so the socket path never hangs.
  NLU_TIMEOUT_MS: z.coerce.number().default(2000),
  PHONE_REGIONS: z.string().default('EG,SA'),

  // Integration file + live logs (ElevenLabs, LPR, NLU, SAP, …)
  INTEGRATION_LOG_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  INTEGRATION_LOG_DIR: z.string().default('logs'),
  INTEGRATION_LOG_MAX_BODY_CHARS: z.coerce.number().default(2000),
  INTEGRATION_LOG_MAX_FILE_MB: z.coerce.number().default(10),
  INTEGRATION_LOG_ROTATE_KEEP: z.coerce.number().default(3),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${detail}`);
  }
  return parsed.data;
}
