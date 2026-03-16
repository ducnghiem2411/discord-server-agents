import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { ManagerJobData, DevJobData, QAJobData } from '../types/task.js';
import { logger } from '../utils/logger.js';

export const QUEUE_NAMES = {
  MANAGER: 'manager-tasks',
  DEV: 'dev-tasks',
  QA: 'qa-tasks',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

function parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1) || '0', 10) : 0,
  };
}

export function getConnectionOptions() {
  return parseRedisUrl(env.REDIS_URL);
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

const queueCache = new Map<string, Queue>();

function createQueue<T>(name: string): Queue<T> {
  const existing = queueCache.get(name);
  if (existing) return existing as Queue<T>;

  const queue = new Queue<T>(name, {
    connection: getConnectionOptions(),
    defaultJobOptions,
  });
  queueCache.set(name, queue);
  logger.info(`[Queue] Queue "${name}" initialized`);
  return queue;
}

export function getManagerQueue(): Queue<ManagerJobData> {
  return createQueue<ManagerJobData>(QUEUE_NAMES.MANAGER);
}

export function getDevQueue(): Queue<DevJobData> {
  return createQueue<DevJobData>(QUEUE_NAMES.DEV);
}

export function getQAQueue(): Queue<QAJobData> {
  return createQueue<QAJobData>(QUEUE_NAMES.QA);
}

export function getQueue(name: QueueName): Queue {
  switch (name) {
    case QUEUE_NAMES.MANAGER:
      return getManagerQueue();
    case QUEUE_NAMES.DEV:
      return getDevQueue();
    case QUEUE_NAMES.QA:
      return getQAQueue();
    default:
      throw new Error(`Unknown queue: ${name}`);
  }
}

export async function closeQueues(): Promise<void> {
  for (const [name, queue] of queueCache) {
    await queue.close();
    logger.info(`[Queue] Queue "${name}" closed`);
  }
  queueCache.clear();
}
