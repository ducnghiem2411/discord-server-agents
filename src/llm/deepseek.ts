import { ChatOpenAI } from '@langchain/openai';
import { env } from '../config/env.js';
import { getLangfuseHandler } from './langfuse.js';
import { LLMProvider, llmMessagesToLangChain } from './provider.js';
import { logger } from '../utils/logger.js';

// DeepSeek exposes an OpenAI-compatible API endpoint
export class DeepSeekProvider implements LLMProvider {
  private model: ChatOpenAI;

  constructor() {
    if (!env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY is required when using the deepseek provider');
    }
    this.model = new ChatOpenAI({
      model: env.DEEPSEEK_MODEL,
      configuration: {
        baseURL: env.DEEPSEEK_BASE_URL,
        apiKey: env.DEEPSEEK_API_KEY,
      },
    });
  }

  async generate(prompt: string, systemPrompt?: string, options?: import('./provider.js').LLMGenerateOptions): Promise<string> {
    logger.debug(`[DeepSeek] Generating with model ${env.DEEPSEEK_MODEL}`);

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

  async generateWithMessages(
    messages: import('./provider.js').LLMMessage[],
    options?: import('./provider.js').LLMGenerateOptions,
  ): Promise<string> {
    logger.debug(`[DeepSeek] generateWithMessages (${messages.length} msgs) model ${env.DEEPSEEK_MODEL}`);
    const callbacks = options?.callbacks ?? getLangfuseHandler();
    const runConfig = callbacks ? { callbacks: Array.isArray(callbacks) ? callbacks : [callbacks] } : {};
    const response = await this.model.invoke(llmMessagesToLangChain(messages), runConfig);
    return typeof response.content === 'string' ? response.content : '';
  }
}
