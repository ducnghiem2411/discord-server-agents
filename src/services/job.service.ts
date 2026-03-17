import { getPool } from '../memory/postgres.js';
import { PipelineJobData } from '../types/task.js';
import { logger } from '../utils/logger.js';

export const QUEUE_NAMES = {
  MANAGER: 'manager',
  DEV: 'dev',
  QA: 'qa',
} as const;

export interface JobRow {
  id: number;
  task_id: number;
  queue_name: string;
  data: PipelineJobData;
  status: string;
}

export class JobService {
  private static instance: JobService;

  static getInstance(): JobService {
    if (!JobService.instance) {
      JobService.instance = new JobService();
    }
    return JobService.instance;
  }

  async enqueue(queueName: string, data: PipelineJobData): Promise<number> {
    const pool = getPool();
    const result = await pool.query<{ id: number }>(
      `INSERT INTO jobs (task_id, queue_name, data, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [data.taskId, queueName, JSON.stringify(data)],
    );
    const id = result.rows[0].id;
    logger.debug(`[JobService] Enqueued job ${id} to ${queueName}`);
    return id;
  }

  async claimNext(queueName: string): Promise<JobRow | null> {
    const pool = getPool();
    const result = await pool.query<{
      id: number;
      task_id: number;
      queue_name: string;
      data: unknown;
      status: string;
    }>(
      `UPDATE jobs SET status = 'running', attempts = attempts + 1
       WHERE id = (
         SELECT id FROM jobs
         WHERE queue_name = $1 AND status = 'pending'
         ORDER BY id ASC LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, task_id, queue_name, data, status`,
      [queueName],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      task_id: row.task_id,
      queue_name: row.queue_name,
      data: row.data as PipelineJobData,
      status: row.status,
    };
  }

  async completeJob(jobId: number): Promise<void> {
    const pool = getPool();
    await pool.query(`UPDATE jobs SET status = 'completed' WHERE id = $1`, [jobId]);
    logger.debug(`[JobService] Job ${jobId} completed`);
  }

  async failJob(jobId: number, error: string): Promise<void> {
    const pool = getPool();
    await pool.query(`UPDATE jobs SET status = 'failed', error = $1 WHERE id = $2`, [
      error,
      jobId,
    ]);
    logger.debug(`[JobService] Job ${jobId} failed: ${error}`);
  }
}
