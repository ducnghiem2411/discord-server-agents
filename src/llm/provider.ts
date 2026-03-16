export interface LLMProvider {
  generate(prompt: string, systemPrompt?: string): Promise<string>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
