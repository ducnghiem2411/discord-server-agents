import { v4 as uuidv4 } from 'uuid';
import { query } from '../memory/postgres.js';
import { getManagerQueue } from '../queue/queues.js';
import { Task, ManagerJobData, TaskStatus } from '../types/task.js';
import { AgentResult } from '../types/agent.js';
import { logger } from '../utils/logger.js';

interface CreateTaskInput {
  description: string;
  discordChannelId: string;
  discordMessageId: string;
}

interface TaskRow {
  id: string;
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
    const id = uuidv4();

    const rows = await query<TaskRow>(
      `INSERT INTO tasks (id, description, status, discord_channel_id, discord_message_id)
       VALUES ($1, $2, 'pending', $3, $4)
       RETURNING *`,
      [id, input.description, input.discordChannelId, input.discordMessageId],
    );

    const task = rowToTask(rows[0]);
    logger.info(`[TaskService] Created task ${task.id}`);

    const jobData: ManagerJobData = {
      taskId: task.id,
      description: task.description,
      channelId: input.discordChannelId,
      messageId: input.discordMessageId,
    };

    const queue = getManagerQueue();
    await queue.add('manager-task', jobData, { jobId: task.id });
    logger.info(`[TaskService] Queued task ${task.id}`);

    return task;
  }

  async getTask(taskId: string): Promise<Task | null> {
    const rows = await query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
    return rows.length > 0 ? rowToTask(rows[0]) : null;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    await query(`UPDATE tasks SET status = $1 WHERE id = $2`, [status, taskId]);
    logger.debug(`[TaskService] Task ${taskId} status → ${status}`);
  }

  async completeTask(taskId: string, result: string, agentResults: AgentResult[]): Promise<void> {
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

  async failTask(taskId: string, error: string): Promise<void> {
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
