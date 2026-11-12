import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // fallback to local server .env

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000').transform((v) => parseInt(v, 10)),
  DATABASE_URL: z.string().default('file:./dev.db'),
  GEMINI_API_KEY: z.string().optional().default(''),
  PAYPAL_CLIENT_ID: z.string().optional().default(''),
  PAYPAL_CLIENT_SECRET: z.string().optional().default(''),
  PAYPAL_ENVIRONMENT: z.enum(['sandbox', 'live']).default('sandbox'),
  DEMO_MODE: z.string().optional().default(''),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_FALLBACK_MODELS: z.string().optional(),
  GEMINI_TIMEOUT_MS: z.string().optional(),
  GEMINI_MAX_ATTEMPTS: z.string().optional(),
  AI_MAX_CONCURRENT_CALLS: z.string().optional(),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
