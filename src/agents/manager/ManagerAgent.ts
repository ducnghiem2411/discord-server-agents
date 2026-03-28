import { getLLMProvider } from '../../llm/index.js';
import type { Agent, AgentExecuteOptions } from '../../types/agent.js';
import { logger } from '../../utils/logger.js';
import { MANAGER_SYSTEM_PROMPT } from './prompts/system.js';

export class ManagerAgent implements Agent {
  name = 'Manager';

  async execute(input: string, options?: AgentExecuteOptions): Promise<string> {
    logger.info(`[ManagerAgent] Processing task: "${input}"`);
    const llm = getLLMProvider();
    const result = await llm.generate(input, MANAGER_SYSTEM_PROMPT, { callbacks: options?.callbacks });
    logger.info('[ManagerAgent] Plan generated');
    return result;
  }
}
