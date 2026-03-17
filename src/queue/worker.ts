import { JobService, QUEUE_NAMES } from '../services/job.service.js';
import { PipelineJobData } from '../types/task.js';
import { ManagerAgent } from '../agents/manager.js';
import { DevAgent } from '../agents/dev.js';
import { QAAgent } from '../agents/qa.js';
import { TaskService } from '../services/task.service.js';
import { AgentBot } from '../discord/AgentBot.js';
import { AgentResult } from '../types/agent.js';
import { logger } from '../utils/logger.js';

const POLL_INTERVAL_MS = 1000;

const managerAgent = new ManagerAgent();
const devAgent = new DevAgent();
const qaAgent = new QAAgent();
const taskService = TaskService.getInstance();
const jobService = JobService.getInstance();

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  manager: 'Manager',
  dev: 'Dev',
  qa: 'QA',
};

function getDisplayName(agent: string): string {
  return AGENT_DISPLAY_NAMES[agent.toLowerCase()] ?? agent;
}

function buildPromptForAgent(
  agent: string,
  description: string,
  pipeline: string[],
  outputs: Record<string, string>,
): string {
  const idx = pipeline.indexOf(agent);
  const previousAgents = pipeline.slice(0, idx);

  if (agent === 'manager') {
    return description;
  }

  const parts = [`Original Task: ${description}`];
  if (previousAgents.includes('manager') && outputs.manager) {
    parts.push(`\nManager's Plan:\n${outputs.manager}`);
  }
  if (previousAgents.includes('dev') && outputs.dev) {
    parts.push(`\nDev Agent's Implementation:\n${outputs.dev}`);
  }

  if (agent === 'dev') {
    parts.push(
      previousAgents.includes('manager')
        ? '\n\nPlease implement the solution based on the plan above.'
        : '\n\nPlease implement the solution for this task.',
    );
  } else if (agent === 'qa') {
    parts.push(
      previousAgents.includes('dev')
        ? '\n\nPlease review the implementation above.'
        : '\n\nPlease review and assess this task.',
    );
  }

  return parts.join('');
}

async function runAgentAndContinue(
  jobData: PipelineJobData,
  agentName: string,
  output: string,
  bot: AgentBot,
): Promise<void> {
  const { taskId, description, channelId, messageId, pipeline, currentIndex, outputs } = jobData;
  const updatedOutputs = { ...outputs, [agentName]: output };

  const embed = AgentBot.buildAgentEmbed(getDisplayName(agentName), output, String(taskId));
  await bot.postAgentResult(channelId, embed);

  const nextIndex = currentIndex + 1;
  if (nextIndex < pipeline.length) {
    const nextAgent = pipeline[nextIndex];
    const nextJobData: PipelineJobData = {
      ...jobData,
      currentIndex: nextIndex,
      outputs: updatedOutputs,
    };
    await jobService.enqueue(nextAgent, nextJobData);
    logger.info(`[Worker] Enqueued ${nextAgent} for task ${taskId}`);
  } else {
    const results: AgentResult[] = pipeline.map((a) => ({
      agent: getDisplayName(a),
      output: updatedOutputs[a] ?? '',
      timestamp: new Date(),
    }));
    await taskService.completeTask(taskId, output, results);
    await bot.updateTaskCompleted(channelId, messageId, description);
    logger.info(`[Worker] Task ${taskId} completed`);
  }
}

export interface WorkerHandle {
  stop(): void;
}

function createWorker(
  queueName: string,
  agentName: string,
  agent: { execute(input: string): Promise<string> },
  bot: AgentBot,
): WorkerHandle {
  const intervalId = setInterval(async () => {
    try {
      const job = await jobService.claimNext(queueName);
      if (!job) return;

      const jobData = job.data;
      const { taskId, description, channelId, messageId, pipeline, currentIndex, outputs } = jobData;

      logger.info(`[${agentName}Worker] Processing job ${job.id} for task ${taskId}`);

      try {
        if (currentIndex === 0) await taskService.updateTaskStatus(taskId, 'running');

        const prompt = buildPromptForAgent(agentName.toLowerCase(), description, pipeline, outputs);
        const output = await agent.execute(prompt);

        await runAgentAndContinue(jobData, agentName.toLowerCase(), output, bot);
        await jobService.completeJob(job.id);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[${agentName}Worker] Job ${job.id} failed`, error);
        await jobService.failJob(job.id, errMsg);
        await taskService.failTask(taskId, errMsg);
        await bot.updateTaskFailed(channelId, messageId, description, errMsg);
      }
    } catch (error) {
      logger.error(`[${agentName}Worker] Poll error`, error);
    }
  }, POLL_INTERVAL_MS);

  logger.info(`[${agentName}Worker] Started, polling "${queueName}" every ${POLL_INTERVAL_MS}ms`);

  return {
    stop() {
      clearInterval(intervalId);
      logger.info(`[${agentName}Worker] Stopped`);
    },
  };
}

export function startManagerWorker(managerBot: AgentBot): WorkerHandle {
  return createWorker(
    QUEUE_NAMES.MANAGER,
    'Manager',
    managerAgent,
    managerBot,
  );
}

export function startDevWorker(devBot: AgentBot): WorkerHandle {
  return createWorker(QUEUE_NAMES.DEV, 'Dev', devAgent, devBot);
}

export function startQAWorker(qaBot: AgentBot): WorkerHandle {
  return createWorker(QUEUE_NAMES.QA, 'QA', qaAgent, qaBot);
}
