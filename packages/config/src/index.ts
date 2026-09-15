import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      loadEnv({ path: candidate });
      return;
    }
    const parent = dirname(resolve(dir));
    if (parent === dir) return;
    dir = parent;
  }
}

loadRootEnv();

/** Runtime config, validated at boot. Never logs values of secret fields. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('ojaline'),
  DB_USER: z.string().default('ojaline_app'),
  DB_PASSWORD: z.string().default('ojaline_app_dev_pw'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  API_PORT: z.coerce.number().default(3000),
  PAYSTACK_SECRET_KEY: z.string().default('sk_test_ojaline_mock'),
  PAYSTACK_BASE_URL: z.string().default('http://localhost:9202'),
  PAYSTACK_WEBHOOK_SECRET: z.string().default('whsec_ojaline_dev'),
  AUTH_JWT_SECRET: z.string().default('ojaline_dev_jwt_secret_change_me'),
  AUTH_JWT_TTL: z.string().default('7d'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  AUTH_APP_URL: z.string().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().default('http://localhost:3000'),
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(''),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(''),
  FACEBOOK_APP_ID: z.string().default(''),
  FACEBOOK_APP_SECRET: z.string().default(''),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@ojaline.com'),
});

export type OjalineConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OjalineConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
