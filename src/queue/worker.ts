import { Worker, Job } from 'bullmq';
import {
  getConnectionOptions,
  QUEUE_NAMES,
  getManagerQueue,
  getDevQueue,
  getQAQueue,
} from './queues.js';
import { ManagerJobData, DevJobData, QAJobData } from '../types/task.js';
import { ManagerAgent } from '../agents/manager.js';
import { DevAgent } from '../agents/dev.js';
import { QAAgent } from '../agents/qa.js';
import { TaskService } from '../services/task.service.js';
import { AgentBot } from '../discord/AgentBot.js';
import { AgentResult } from '../types/agent.js';
import { logger } from '../utils/logger.js';

const managerAgent = new ManagerAgent();
const devAgent = new DevAgent();
const qaAgent = new QAAgent();
const taskService = TaskService.getInstance();

export function startManagerWorker(managerBot: AgentBot): Worker<ManagerJobData> {
  const worker = new Worker<ManagerJobData>(
    QUEUE_NAMES.MANAGER,
    async (job: Job<ManagerJobData>) => {
      const { taskId, description, channelId, messageId } = job.data;

      logger.info(`[ManagerWorker] Processing job ${job.id} for task ${taskId}`);

      await taskService.updateTaskStatus(taskId, 'running');

      const managerOutput = await managerAgent.execute(description);

      const embed = AgentBot.buildAgentEmbed('Manager', managerOutput, taskId);
      await managerBot.postAgentResult(channelId, embed);

      const devQueue = getDevQueue();
      const devJobData: DevJobData = {
        ...job.data,
        managerOutput,
      };
      await devQueue.add('dev-task', devJobData, { jobId: `${taskId}-dev` });

      logger.info(`[ManagerWorker] Job ${job.id} completed, enqueued dev task`);
    },
    {
      connection: getConnectionOptions(),
      concurrency: 2,
    },
  );

  worker.on('failed', async (job, error) => {
    logger.error(`[ManagerWorker] Job ${job?.id} failed`, error);
    if (job?.data) {
      const { taskId, channelId, messageId, description } = job.data;
      await taskService.failTask(taskId, error.message);
      await managerBot.updateTaskFailed(channelId, messageId, description, error.message);
    }
  });

  worker.on('error', (error) => logger.error('[ManagerWorker] Worker error', error));
  logger.info(`[ManagerWorker] Started, listening on "${QUEUE_NAMES.MANAGER}"`);
  return worker;
}

export function startDevWorker(devBot: AgentBot): Worker<DevJobData> {
  const worker = new Worker<DevJobData>(
    QUEUE_NAMES.DEV,
    async (job: Job<DevJobData>) => {
      const { taskId, description, channelId, messageId, managerOutput } = job.data;

      logger.info(`[DevWorker] Processing job ${job.id} for task ${taskId}`);

      const prompt = `Original Task: ${description}\n\nManager's Plan:\n${managerOutput}\n\nPlease implement the solution based on the plan above.`;
      const devOutput = await devAgent.execute(prompt);

      const embed = AgentBot.buildAgentEmbed('Dev', devOutput, taskId);
      await devBot.postAgentResult(channelId, embed);

      const qaQueue = getQAQueue();
      const qaJobData: QAJobData = {
        ...job.data,
        devOutput,
      };
      await qaQueue.add('qa-task', qaJobData, { jobId: `${taskId}-qa` });

      logger.info(`[DevWorker] Job ${job.id} completed, enqueued qa task`);
    },
    {
      connection: getConnectionOptions(),
      concurrency: 2,
    },
  );

  worker.on('failed', async (job, error) => {
    logger.error(`[DevWorker] Job ${job?.id} failed`, error);
    if (job?.data) {
      const { taskId, channelId, messageId, description } = job.data;
      await taskService.failTask(taskId, error.message);
      await devBot.updateTaskFailed(channelId, messageId, description, error.message);
    }
  });

  worker.on('error', (error) => logger.error('[DevWorker] Worker error', error));
  logger.info(`[DevWorker] Started, listening on "${QUEUE_NAMES.DEV}"`);
  return worker;
}

export function startQAWorker(qaBot: AgentBot): Worker<QAJobData> {
  const worker = new Worker<QAJobData>(
    QUEUE_NAMES.QA,
    async (job: Job<QAJobData>) => {
      const { taskId, description, channelId, messageId, managerOutput, devOutput } = job.data;

      logger.info(`[QAWorker] Processing job ${job.id} for task ${taskId}`);

      const prompt = `Original Task: ${description}\n\nManager's Plan:\n${managerOutput}\n\nDev Agent's Implementation:\n${devOutput}\n\nPlease review the implementation above.`;
      const qaOutput = await qaAgent.execute(prompt);

      const embed = AgentBot.buildAgentEmbed('QA', qaOutput, taskId);
      await qaBot.postAgentResult(channelId, embed);

      const results: AgentResult[] = [
        { agent: 'Manager', output: managerOutput, timestamp: new Date() },
        { agent: 'Dev', output: devOutput, timestamp: new Date() },
        { agent: 'QA', output: qaOutput, timestamp: new Date() },
      ];

      await taskService.completeTask(taskId, qaOutput, results);

      await qaBot.updateTaskCompleted(channelId, messageId, description);

      logger.info(`[QAWorker] Job ${job.id} completed, task ${taskId} marked completed`);
    },
    {
      connection: getConnectionOptions(),
      concurrency: 2,
    },
  );

  worker.on('failed', async (job, error) => {
    logger.error(`[QAWorker] Job ${job?.id} failed`, error);
    if (job?.data) {
      const { taskId, channelId, messageId, description } = job.data;
      await taskService.failTask(taskId, error.message);
      await qaBot.updateTaskFailed(channelId, messageId, description, error.message);
    }
  });

  worker.on('error', (error) => logger.error('[QAWorker] Worker error', error));
  logger.info(`[QAWorker] Started, listening on "${QUEUE_NAMES.QA}"`);
  return worker;
}
