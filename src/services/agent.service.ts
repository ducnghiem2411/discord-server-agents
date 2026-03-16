import { runWorkflow, WorkflowOutput } from '../graph/workflow.js';
import { logger } from '../utils/logger.js';

export class AgentService {
  private static instance: AgentService;

  static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  /**
   * Run the full multi-agent workflow for a given task description.
   */
  async runTask(description: string): Promise<WorkflowOutput> {
    logger.info(`[AgentService] Running task: "${description}"`);
    const result = await runWorkflow(description);
    logger.info('[AgentService] Task workflow finished');
    return result;
  }
}
