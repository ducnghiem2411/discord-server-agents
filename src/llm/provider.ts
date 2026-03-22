import type { BaseCallbackHandler } from '@langchain/core/callbacks/base.js';

export interface LLMGenerateOptions {
  callbacks?: BaseCallbackHandler[];
}

export interface LLMProvider {
  generate(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<string>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
