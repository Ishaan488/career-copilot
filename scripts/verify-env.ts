import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

// Load .env
const envPath = resolve(process.cwd(), '.env');
if (!existsSync(envPath)) {
  console.warn('[verify-env] Warning: .env file does not exist yet. Checking process.env or .env.example.');
  dotenv.config({ path: resolve(process.cwd(), '.env.example') });
} else {
  dotenv.config({ path: envPath });
}

interface EnvCheck {
  key: string;
  required: boolean;
  validate?: (val: string) => boolean;
  description: string;
}

const CHECKS: EnvCheck[] = [
  { key: 'NODE_ENV', required: true, description: 'Application environment' },
  { key: 'APP_ORIGIN', required: true, description: 'Base origin for local access (e.g. http://127.0.0.1:3000)' },
  { key: 'DATABASE_URL', required: true, description: 'PostgreSQL connection URL' },
  { key: 'TEST_DATABASE_URL', required: true, description: 'Test database connection URL' },
  { key: 'DATA_DIR', required: true, description: 'Directory for storage' },
  { key: 'GEMINI_API_KEY', required: false, description: 'Google Gemini API key for intelligence features' },
  { key: 'TELEGRAM_BOT_TOKEN', required: false, description: 'Telegram bot token for notifications' },
  { key: 'TELEGRAM_CHAT_ID', required: false, description: 'Telegram chat ID for notifications' },
  { key: 'SMTP_HOST', required: false, description: 'SMTP host for email notifications' },
  { key: 'IMAP_HOST', required: false, description: 'IMAP host for email monitoring (optional)' },
];

export function verifyEnv() {
  console.info('=== Career Copilot Environment Verification ===');
  let hasMissingRequired = false;

  for (const check of CHECKS) {
    const val = process.env[check.key];
    if (!val && check.required) {
      console.error(`❌ Missing REQUIRED environment variable: ${check.key} (${check.description})`);
      hasMissingRequired = true;
    } else if (!val) {
      console.info(`⚪ Optional variable not configured: ${check.key} (${check.description})`);
    } else {
      console.info(`✅ Configured: ${check.key}`);
    }
  }

  if (hasMissingRequired) {
    console.error('Environment verification FAILED. Please configure the required variables in .env');
    return false;
  }

  console.info('Environment verification PASSED.');
  return true;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('verify-env.ts')) {
  const ok = verifyEnv();
  process.exit(ok ? 0 : 1);
}
