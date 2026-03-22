import { ChatOpenAI } from '@langchain/openai';
import { env } from '../config/env.js';
import { getLangfuseHandler } from './langfuse.js';
import { LLMProvider } from './provider.js';
import { logger } from '../utils/logger.js';

export class OpenAIProvider implements LLMProvider {
  private model: ChatOpenAI;

  constructor() {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when using the openai provider');
    }
    this.model = new ChatOpenAI({
      model: env.OPENAI_MODEL,
    });
  }

  async generate(prompt: string, systemPrompt?: string, options?: import('./provider.js').LLMGenerateOptions): Promise<string> {
    logger.debug(`[OpenAI] Generating with model ${env.OPENAI_MODEL}`);

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const callbacks = options?.callbacks ?? getLangfuseHandler();
    const runConfig = callbacks ? { callbacks: Array.isArray(callbacks) ? callbacks : [callbacks] } : {};
    const response = await this.model.invoke(messages, runConfig);
    return typeof response.content === 'string' ? response.content : '';
  }
}
