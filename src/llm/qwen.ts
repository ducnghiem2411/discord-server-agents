import { ChatOpenAI } from '@langchain/openai';
import { env } from '../config/env.js';
import { LLMProvider } from './provider.js';
import { logger } from '../utils/logger.js';

// Qwen exposes an OpenAI-compatible API endpoint
export class QwenProvider implements LLMProvider {
  private model: ChatOpenAI;

  constructor() {
    if (!env.QWEN_API_KEY) {
      throw new Error('QWEN_API_KEY is required when using the qwen provider');
    }
    this.model = new ChatOpenAI({
      model: env.QWEN_MODEL,
      configuration: {
        baseURL: env.QWEN_BASE_URL,
        apiKey: env.QWEN_API_KEY,
      },
    });
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    logger.debug(`[Qwen] Generating with model ${env.QWEN_MODEL}`);

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.model.invoke(messages);
    return typeof response.content === 'string' ? response.content : '';
  }
}
