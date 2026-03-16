import OpenAI from 'openai';
import { env } from '../config/env.js';
import { LLMProvider } from './provider.js';
import { logger } from '../utils/logger.js';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when using the openai provider');
    }
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.model = env.OPENAI_MODEL;
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    logger.debug(`[OpenAI] Generating with model ${this.model}`);

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
