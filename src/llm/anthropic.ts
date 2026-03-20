import { ChatAnthropic } from '@langchain/anthropic';
import { env } from '../config/env.js';
import { LLMProvider } from './provider.js';
import { logger } from '../utils/logger.js';

export class AnthropicProvider implements LLMProvider {
  private model: ChatAnthropic;

  constructor() {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when using the anthropic provider');
    }
    this.model = new ChatAnthropic({
      model: env.ANTHROPIC_MODEL,
      maxTokens: 4096,
    });
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    logger.debug(`[Anthropic] Generating with model ${env.ANTHROPIC_MODEL}`);

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.model.invoke(messages);
    return typeof response.content === 'string' ? response.content : '';
  }
}
