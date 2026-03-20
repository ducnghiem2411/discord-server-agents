import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { env } from '../config/env.js';
import { LLMProvider } from './provider.js';
import { logger } from '../utils/logger.js';

export class GeminiProvider implements LLMProvider {
  private model: ChatGoogleGenerativeAI;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required when using the gemini provider');
    }
    this.model = new ChatGoogleGenerativeAI({
      model: env.GEMINI_MODEL,
      apiKey: env.GEMINI_API_KEY,
    });
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    logger.debug(`[Gemini] Generating with model ${env.GEMINI_MODEL}`);

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.model.invoke(messages);
    return typeof response.content === 'string' ? response.content : '';
  }
}
