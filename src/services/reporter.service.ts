import { query } from '../memory/postgres.js';
import { Task, TaskStatus } from '../types/task.js';
import { logger } from '../utils/logger.js';

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

interface MessageRow {
  id: number;
  task_id: number;
  agent: string;
  content: string;
  created_at: Date;
}

interface JobStatsRow {
  queue_name: string;
  status: string;
  count: string;
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

export class ReporterService {
  private static instance: ReporterService;

  static getInstance(): ReporterService {
    if (!ReporterService.instance) {
      ReporterService.instance = new ReporterService();
    }
    return ReporterService.instance;
  }

  async getTaskById(taskId: number): Promise<Task | null> {
    const rows = await query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
    return rows.length > 0 ? rowToTask(rows[0]) : null;
  }

  async listTasks(limit = 20, status?: TaskStatus): Promise<Task[]> {
    if (status) {
      const rows = await query<TaskRow>(
        `SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
        [status, limit],
      );
      return rows.map(rowToTask);
    }
    const rows = await query<TaskRow>(
      `SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(rowToTask);
  }

  async getTaskMessages(taskId: number): Promise<{ agent: string; content: string; createdAt: Date }[]> {
    const rows = await query<MessageRow>(
      `SELECT id, task_id, agent, content, created_at FROM messages WHERE task_id = $1 ORDER BY created_at ASC`,
      [taskId],
    );
    return rows.map((r) => ({ agent: r.agent, content: r.content, createdAt: r.created_at }));
  }

  async getJobStats(): Promise<{ queueName: string; status: string; count: number }[]> {
    const rows = await query<JobStatsRow>(
      `SELECT queue_name, status, COUNT(*)::text as count FROM jobs GROUP BY queue_name, status`,
    );
    return rows.map((r) => ({ queueName: r.queue_name, status: r.status, count: parseInt(r.count, 10) }));
  }

  async getProgressSummary(): Promise<{
    tasksByStatus: Record<TaskStatus, number>;
    recentTasks: Task[];
    jobStats: { queueName: string; status: string; count: number }[];
  }> {
    const [statusRows, recentRows, jobRows] = await Promise.all([
      query<{ status: TaskStatus; count: string }>(
        `SELECT status, COUNT(*)::text as count FROM tasks GROUP BY status`,
      ),
      query<TaskRow>(`SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10`),
      query<JobStatsRow>(
        `SELECT queue_name, status, COUNT(*)::text as count FROM jobs GROUP BY queue_name, status`,
      ),
    ]);

    const tasksByStatus: Record<TaskStatus, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    for (const r of statusRows) {
      tasksByStatus[r.status] = parseInt(r.count, 10);
    }

    return {
      tasksByStatus,
      recentTasks: recentRows.map(rowToTask),
      jobStats: jobRows.map((r) => ({ queueName: r.queue_name, status: r.status, count: parseInt(r.count, 10) })),
    };
  }
}
