import { tool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { ReporterService } from '../../../services/reporter.service.js';
import type { Task } from '../../../types/task.js';

export const REPORT_TOOL_NAMES = new Set(['get_progress_summary', 'get_task_detail']);

function serializeTask(t: Task) {
  return {
    id: t.id,
    description: t.description,
    status: t.status,
    result: t.result ?? null,
    error: t.error ?? null,
    discordChannelId: t.discordChannelId ?? null,
    discordMessageId: t.discordMessageId ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt?.toISOString() ?? null,
  };
}

const progressSummarySchema = z.object({});

const taskDetailSchema = z.object({
  task_id: z.number().int().positive(),
});

function buildReporterTools(svc: ReporterService) {
  const getProgressSummary = tool(
    async (_input: z.infer<typeof progressSummarySchema>) => {
      const summary = await svc.getProgressSummary();
      return JSON.stringify({
        tasksByStatus: summary.tasksByStatus,
        recentTasks: summary.recentTasks.map(serializeTask),
        jobStats: summary.jobStats,
      });
    },
    {
      name: 'get_progress_summary',
      description:
        'Lấy tóm tắt tiến độ: số task theo trạng thái (pending/running/completed/failed), thống kê jobs theo queue, và 10 task gần nhất. Dùng khi user hỏi tổng quan tiến độ, danh sách task, jobs, báo cáo chung.',
      schema: progressSummarySchema,
    },
  );

  const getTaskDetail = tool(
    async (input: z.infer<typeof taskDetailSchema>) => {
      const task = await svc.getTaskById(input.task_id);
      if (!task) {
        return JSON.stringify({ error: 'not_found', task_id: input.task_id });
      }
      const agentMessages = await svc.getTaskMessages(input.task_id);
      return JSON.stringify({
        task: serializeTask(task),
        agentMessages: agentMessages.map((m) => ({
          agent: m.agent,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    },
    {
      name: 'get_task_detail',
      description:
        'Lấy chi tiết một task theo ID: mô tả, trạng thái, kết quả/lỗi, và các tin nhắn output từ agent. Dùng khi user hỏi về một task cụ thể (theo số ID).',
      schema: taskDetailSchema,
    },
  );

  return [getProgressSummary, getTaskDetail] as const;
}

let cached: StructuredToolInterface[] | null = null;

/** LangChain tools bound to {@link ReporterService} singleton (for bindTools). */
export function getReporterTools(): StructuredToolInterface[] {
  if (cached) return cached;
  const svc = ReporterService.getInstance();
  cached = [...buildReporterTools(svc)];
  return cached;
}

/** Find a reporter tool by name for manual execution from raw tool_calls. */
export function getReporterToolByName(name: string): StructuredToolInterface | undefined {
  return getReporterTools().find((t) => t.name === name);
}
