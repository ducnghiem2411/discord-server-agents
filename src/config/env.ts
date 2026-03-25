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
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'qwen', 'gemini', 'deepseek']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  /** Reporter long-term memory: Ollama embedding API (e.g. nomic-embed-text, 768-dim). */
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022'),
  QWEN_API_KEY: z.string().optional(),
  QWEN_MODEL: z.string().default('qwen-plus'),
  QWEN_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),

  // Langfuse (optional — tracing & observability)
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().optional(),

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
