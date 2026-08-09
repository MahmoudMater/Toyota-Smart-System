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
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:8080,http://127.0.0.1:8080'),
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
