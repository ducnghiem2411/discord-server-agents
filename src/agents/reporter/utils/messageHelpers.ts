import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMMessage } from '../../../llm/provider.js';

export function llmMessagesToBaseMessages(history: LLMMessage[]): BaseMessage[] {
  return history.map((m) => {
    if (m.role === 'system') return new SystemMessage(m.content);
    if (m.role === 'user') return new HumanMessage(m.content);
    return new AIMessage(m.content);
  });
}

export function aiMessageText(msg: AIMessage): string {
  const c = msg.content;
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c)) {
    const parts: string[] = [];
    for (const block of c) {
      if (typeof block === 'string') {
        parts.push(block);
      } else if (block && typeof block === 'object' && 'type' in block) {
        const b = block as { type?: string; text?: string };
        if (b.type === 'text' && b.text) parts.push(b.text);
      }
    }
    return parts.join('').trim();
  }
  return '';
}

export function parseToolArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}
