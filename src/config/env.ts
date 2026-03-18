import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Discord — 3 bots
  MANAGER_BOT_TOKEN: z.string().min(1, 'MANAGER_BOT_TOKEN is required'),
  MANAGER_BOT_CLIENT_ID: z.string().min(1, 'MANAGER_BOT_CLIENT_ID is required'),
  DEV_BOT_TOKEN: z.string().min(1, 'DEV_BOT_TOKEN is required'),
  DEV_BOT_CLIENT_ID: z.string().min(1, 'DEV_BOT_CLIENT_ID is required'),
  QA_BOT_TOKEN: z.string().min(1, 'QA_BOT_TOKEN is required'),
  QA_BOT_CLIENT_ID: z.string().min(1, 'QA_BOT_CLIENT_ID is required'),
  DISCORD_GUILD_ID: z.string().min(1, 'DISCORD_GUILD_ID is required'),

  // Reporter bot (optional — app runs without it)
  REPORTER_BOT_TOKEN: z.string().optional(),
  REPORTER_BOT_CLIENT_ID: z.string().optional(),

  // PostgreSQL
  POSTGRES_URL: z.string().min(1, 'POSTGRES_URL is required'),

  // LLM
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'qwen', 'gemini']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022'),
  QWEN_API_KEY: z.string().optional(),
  QWEN_MODEL: z.string().default('qwen-plus'),
  QWEN_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // App
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
