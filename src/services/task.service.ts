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

interface MessageRow {
  id: number;
  task_id: number;
  agent: string;
  content: string;
  created_at: Date;
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

  /** Try to create task. Returns null if duplicate (channel+originalMessageId). Caller must check before posting. */
  async tryCreateTaskForMention(
    description: string,
    discordChannelId: string,
    originalDiscordMessageId: string,
    pipeline: string[],
  ): Promise<Task | null> {
    const rows = await query<TaskRow>(
      `INSERT INTO tasks (description, status, discord_channel_id, original_discord_message_id)
       VALUES ($1, 'pending', $2, $3)
       ON CONFLICT (discord_channel_id, original_discord_message_id) WHERE (original_discord_message_id IS NOT NULL) DO NOTHING
       RETURNING *`,
      [description, discordChannelId, originalDiscordMessageId],
    );
    if (rows.length === 0) {
      logger.info('[TaskService] Duplicate message skipped (channel + original_message_id)');
      return null;
    }
    return rowToTask(rows[0]);
  }

  async updateTaskEmbed(taskId: number, discordMessageId: string): Promise<void> {
    await query(`UPDATE tasks SET discord_message_id = $1 WHERE id = $2`, [discordMessageId, taskId]);
  }

  async createAndQueueTask(input: CreateTaskInput): Promise<Task> {
    const pipeline = input.pipeline ?? [...AGENT_HIERARCHY];
    // #region agent log
    fetch('http://127.0.0.1:7259/ingest/c10a561b-ea24-499b-b104-580905275518',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3e870f'},body:JSON.stringify({sessionId:'3e870f',location:'task.service.ts:createAndQueueTask',message:'createAndQueueTask called',data:{desc:input.description.slice(0,30),pipeline:pipeline.join(',')},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
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

  async getTaskMessages(taskId: number): Promise<{ agent: string; content: string }[]> {
    const rows = await query<MessageRow>(
      `SELECT id, task_id, agent, content, created_at FROM messages WHERE task_id = $1 ORDER BY created_at ASC`,
      [taskId],
    );
    return rows.map((r) => ({ agent: r.agent, content: r.content }));
  }

  /**
   * Load agent outputs from referenced tasks for multi-phase context.
   * Throws if any task is not found or not completed.
   */
  async loadContextFromTasks(taskIds: number[]): Promise<Record<string, string>> {
    const outputs: Record<string, string> = {};

    for (const taskId of taskIds) {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task #${taskId} not found. Referenced tasks must exist.`);
      }
      if (task.status !== 'completed') {
        throw new Error(`Task #${taskId} is not completed. Referenced tasks must be completed.`);
      }

      const messages = await this.getTaskMessages(taskId);
      for (const m of messages) {
        const key = m.agent.toLowerCase();
        outputs[key] = m.content;
      }
    }

    return outputs;
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
