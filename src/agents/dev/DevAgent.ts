import { getLLMProvider } from '../../llm/index.js';
import type { Agent, AgentExecuteOptions } from '../../types/agent.js';
import { logger } from '../../utils/logger.js';
import { DEV_SYSTEM_PROMPT } from './prompts/system.js';

export class DevAgent implements Agent {
  name = 'Dev';

  async execute(input: string, options?: AgentExecuteOptions): Promise<string> {
    logger.info('[DevAgent] Generating implementation');
    const llm = getLLMProvider();
    const result = await llm.generate(input, DEV_SYSTEM_PROMPT, { callbacks: options?.callbacks });
    logger.info('[DevAgent] Implementation generated');
    return result;
  }
}
