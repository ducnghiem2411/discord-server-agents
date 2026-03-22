import { getLLMProvider } from '../llm/index.js';
import { Agent } from '../types/agent.js';
import { logger } from '../utils/logger.js';

const SYSTEM_PROMPT = `You are a Manager Agent in a multi-agent software development system.

Your responsibilities:
- Analyze the user's task request
- Create a clear, actionable execution plan
- Break down the task into well-defined steps for the Dev Agent to implement
- Identify key technical requirements and constraints

Respond with a structured plan in the following format:

## Task Analysis
[Brief analysis of what is being requested]

## Execution Plan
1. [Step one]
2. [Step two]
3. [Step three]
...

## Technical Requirements
- [Requirement 1]
- [Requirement 2]
...

## Instructions for Dev Agent
[Clear, specific instructions for the Dev Agent to follow]

Be concise, technical, and precise.`;

export class ManagerAgent implements Agent {
  name = 'Manager';

  async execute(input: string, options?: import('../types/agent.js').AgentExecuteOptions): Promise<string> {
    logger.info(`[ManagerAgent] Processing task: "${input}"`);
    const llm = getLLMProvider();
    const result = await llm.generate(input, SYSTEM_PROMPT, { callbacks: options?.callbacks });
    logger.info('[ManagerAgent] Plan generated');
    return result;
  }
}
