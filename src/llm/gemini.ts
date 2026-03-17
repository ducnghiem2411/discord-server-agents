import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { LLMProvider } from './provider.js';
import { logger } from '../utils/logger.js';

export class GeminiProvider implements LLMProvider {
  private ai: GoogleGenAI;
  private model: string;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required when using the gemini provider');
    }
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    this.model = env.GEMINI_MODEL;
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    logger.debug(`[Gemini] Generating with model ${this.model}`);

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: systemPrompt ? { systemInstruction: systemPrompt } : undefined,
    });

    return response.text ?? '';
  }
}
