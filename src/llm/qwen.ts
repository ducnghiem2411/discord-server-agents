import OpenAI from 'openai';
import { env } from '../config/env.js';
import { LLMProvider } from './provider.js';
import { logger } from '../utils/logger.js';

// Qwen exposes an OpenAI-compatible API endpoint
export class QwenProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    if (!env.QWEN_API_KEY) {
      throw new Error('QWEN_API_KEY is required when using the qwen provider');
    }
    this.client = new OpenAI({
      apiKey: env.QWEN_API_KEY,
      baseURL: env.QWEN_BASE_URL,
    });
    this.model = env.QWEN_MODEL;
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    logger.debug(`[Qwen] Generating with model ${this.model}`);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
