import { getLLMProvider } from '../../llm/index.js';
import type { Agent, AgentExecuteOptions } from '../../types/agent.js';
import { logger } from '../../utils/logger.js';
import { QA_SYSTEM_PROMPT } from './prompts/system.js';

export class QAAgent implements Agent {
  name = 'QA';

  async execute(input: string, options?: AgentExecuteOptions): Promise<string> {
    logger.info('[QAAgent] Reviewing implementation');
    const llm = getLLMProvider();
    const result = await llm.generate(input, QA_SYSTEM_PROMPT, { callbacks: options?.callbacks });
    logger.info('[QAAgent] Review completed');
    return result;
  }
}
