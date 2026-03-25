import type { BaseCallbackHandler } from '@langchain/core/callbacks/base.js';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface LLMGenerateOptions {
  callbacks?: BaseCallbackHandler[];
}

export interface LLMProvider {
  generate(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<string>;
  /** Full chat transcript including optional leading `system` message. */
  generateWithMessages(messages: LLMMessage[], options?: LLMGenerateOptions): Promise<string>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Map simple transcript to LangChain messages for `invoke`. */
export function llmMessagesToLangChain(messages: LLMMessage[]): BaseMessage[] {
  return messages.map((m) => {
    if (m.role === 'system') return new SystemMessage(m.content);
    if (m.role === 'user') return new HumanMessage(m.content);
    return new AIMessage(m.content);
  });
}
