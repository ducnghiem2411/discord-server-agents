import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { LLMProvider } from './provider.js';
import { logger } from '../utils/logger.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when using the anthropic provider');
    }
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    this.model = env.ANTHROPIC_MODEL;
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    logger.debug(`[Anthropic] Generating with model ${this.model}`);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== 'text') return '';
    return block.text;
  }
}
