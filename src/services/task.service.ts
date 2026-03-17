import { query } from '../memory/postgres.js';
import { JobService } from './job.service.js';
import { AGENT_HIERARCHY } from '../config/agents.js';
import { Task, PipelineJobData, TaskStatus } from '../types/task.js';
import { AgentResult } from '../types/agent.js';
import { logger } from '../utils/logger.js';

const jobService = JobService.getInstance();

interface CreateTaskInput {
  description: string;
  discordChannelId: string;
  discordMessageId: string;
  pipeline?: string[];
}

interface TaskRow {
  id: number;
  description: string;
  status: TaskStatus;
  result: string | null;
  error: string | null;
  discord_channel_id: string | null;
  discord_message_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    description: row.description,
    status: row.status,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    discordChannelId: row.discord_channel_id ?? undefined,
    discordMessageId: row.discord_message_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TaskService {
  private static instance: TaskService;

  static getInstance(): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService();
    }
    return TaskService.instance;
  }

  async createAndQueueTask(input: CreateTaskInput): Promise<Task> {
    const pipeline = input.pipeline ?? [...AGENT_HIERARCHY];

    const rows = await query<TaskRow>(
      `INSERT INTO tasks (description, status, discord_channel_id, discord_message_id)
       VALUES ($1, 'pending', $2, $3)
       RETURNING *`,
      [input.description, input.discordChannelId, input.discordMessageId],
    );

    const task = rowToTask(rows[0]);
    logger.info(`[TaskService] Created task ${task.id} pipeline=${pipeline.join('→')}`);

    const jobData: PipelineJobData = {
      taskId: task.id,
      description: task.description,
      channelId: input.discordChannelId,
      messageId: input.discordMessageId,
      pipeline,
      currentIndex: 0,
      outputs: {},
    };

    await jobService.enqueue(pipeline[0], jobData);
    logger.info(`[TaskService] Queued task ${task.id} to ${pipeline[0]} queue`);

    return task;
  }

  async getTask(taskId: number): Promise<Task | null> {
    const rows = await query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
    return rows.length > 0 ? rowToTask(rows[0]) : null;
  }

  async updateTaskStatus(taskId: number, status: TaskStatus): Promise<void> {
    await query(`UPDATE tasks SET status = $1 WHERE id = $2`, [status, taskId]);
    logger.debug(`[TaskService] Task ${taskId} status → ${status}`);
  }

  async completeTask(taskId: number, result: string, agentResults: AgentResult[]): Promise<void> {
    await query(
      `UPDATE tasks SET status = 'completed', result = $1 WHERE id = $2`,
      [result, taskId],
    );

    // Persist individual agent messages
    for (const agentResult of agentResults) {
      await query(
        `INSERT INTO messages (task_id, agent, content) VALUES ($1, $2, $3)`,
        [taskId, agentResult.agent, agentResult.output],
      );
    }

    logger.info(`[TaskService] Task ${taskId} marked completed`);
  }

  async failTask(taskId: number, error: string): Promise<void> {
    await query(
      `UPDATE tasks SET status = 'failed', error = $1 WHERE id = $2`,
      [error, taskId],
    );
    logger.info(`[TaskService] Task ${taskId} marked failed`);
  }

  async listRecentTasks(limit = 20): Promise<Task[]> {
    const rows = await query<TaskRow>(
      `SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(rowToTask);
  }
}
