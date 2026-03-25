import { env } from '../config/env.js';
import { LLMProvider } from './provider.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { QwenProvider } from './qwen.js';
import { GeminiProvider } from './gemini.js';
import { DeepSeekProvider } from './deepseek.js';

let _provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (_provider) return _provider;

  switch (env.LLM_PROVIDER) {
    case 'openai':
      _provider = new OpenAIProvider();
      break;
    case 'anthropic':
      _provider = new AnthropicProvider();
      break;
    case 'qwen':
      _provider = new QwenProvider();
      break;
    case 'gemini':
      _provider = new GeminiProvider();
      break;
    case 'deepseek':
      _provider = new DeepSeekProvider();
      break;
    default:
      throw new Error(`Unknown LLM provider: ${env.LLM_PROVIDER}`);
  }

  return _provider;
}

export { LLMProvider };
