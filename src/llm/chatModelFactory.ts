import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { env } from '../config/env.js';

/**
 * Returns the same underlying chat model as {@link getLLMProvider}, for flows that need
 * `bindTools` / multi-turn tool messages (Reporter agent).
 */
export function getChatModel(): BaseChatModel {
  switch (env.LLM_PROVIDER) {
    case 'openai': {
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required when using the openai provider');
      }
      return new ChatOpenAI({
        model: env.OPENAI_MODEL,
      });
    }
    case 'anthropic': {
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required when using the anthropic provider');
      }
      return new ChatAnthropic({
        model: env.ANTHROPIC_MODEL,
        maxTokens: 4096,
      });
    }
    case 'qwen': {
      if (!env.QWEN_API_KEY) {
        throw new Error('QWEN_API_KEY is required when using the qwen provider');
      }
      return new ChatOpenAI({
        model: env.QWEN_MODEL,
        configuration: {
          baseURL: env.QWEN_BASE_URL,
          apiKey: env.QWEN_API_KEY,
        },
      });
    }
    case 'gemini': {
      if (!env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is required when using the gemini provider');
      }
      return new ChatGoogleGenerativeAI({
        model: env.GEMINI_MODEL,
        apiKey: env.GEMINI_API_KEY,
      });
    }
    case 'deepseek': {
      if (!env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is required when using the deepseek provider');
      }
      return new ChatOpenAI({
        model: env.DEEPSEEK_MODEL,
        configuration: {
          baseURL: env.DEEPSEEK_BASE_URL,
          apiKey: env.DEEPSEEK_API_KEY,
        },
      });
    }
    default:
      throw new Error(`Unknown LLM provider: ${env.LLM_PROVIDER}`);
  }
}
