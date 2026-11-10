import { z } from 'zod';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config({ path: resolve(process.cwd(), '.env.example') });
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ORIGIN: z.string().url().default('http://127.0.0.1:3000'),
  APP_SECRET: z.string().min(32).default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  DATABASE_URL: z.string().default('postgres://career:career_password@127.0.0.1:5432/career_copilot'),
  TEST_DATABASE_URL: z.string().default('postgres://career:career_password@127.0.0.1:5432/career_copilot_test'),
  DATA_DIR: z.string().default('./data'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TZ_DEFAULT: z.string().default('Asia/Kolkata'),
  GEMINI_API_KEY: z.string().optional().default(''),
  SUBMISSION_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  BROWSER_HEADLESS: z.preprocess((val) => val !== 'false' && val !== false, z.boolean()).default(true),
  BROWSER_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(1),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
  NOTIFY_EMAIL_TO: z.string().optional().default(''),
  IMAP_HOST: z.string().optional().default(''),
  IMAP_PORT: z.coerce.number().optional().default(993),
  IMAP_USER: z.string().optional().default(''),
  IMAP_PASS: z.string().optional().default(''),
  IMAP_FOLDER: z.string().optional().default('INBOX'),
});

export type AppConfig = z.infer<typeof configSchema>;

export const config: AppConfig = configSchema.parse(process.env);
