import { getLLMProvider } from '../llm/index.js';
import { ReporterService } from '../services/reporter.service.js';
import { logger } from '../utils/logger.js';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base.js';

const REPORT_KEYWORDS = [
  'status',
  'task',
  'tiến độ',
  'progress',
  'report',
  'báo cáo',
  'jobs',
  'list',
  'danh sách',
  'task id',
  'taskid',
  'chi tiết',
  'detail',
  'thống kê',
  'stat',
];

function looksLikeReportQuery(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (lower.length < 2) return false;
  return REPORT_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractTaskId(text: string): number | null {
  const match = text.match(/\b(\d{1,10})\b/);
  return match ? parseInt(match[1], 10) : null;
}

export interface ReporterExecuteOptions {
  callbacks?: BaseCallbackHandler[];
}

export class ReporterAgent {
  private reporterService = ReporterService.getInstance();

  async execute(userMessage: string, options?: ReporterExecuteOptions): Promise<string> {
    const trimmed = userMessage.trim();
    logger.info(`[ReporterAgent] Processing: "${trimmed.slice(0, 80)}..."`);

    const taskId = extractTaskId(trimmed);
    const isReportIntent = looksLikeReportQuery(trimmed) || taskId !== null;

    if (isReportIntent) {
      try {
        return await this.handleReportQuery(trimmed, taskId);
      } catch (error) {
        logger.error('[ReporterAgent] Report query failed', error);
        return `Lỗi khi truy vấn dữ liệu: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    return this.handleChat(trimmed, options?.callbacks);
  }

  private async handleReportQuery(userMessage: string, taskId: number | null): Promise<string> {
    const svc = this.reporterService;

    if (taskId !== null) {
      const task = await svc.getTaskById(taskId);
      if (!task) {
        return `Không tìm thấy task với ID \`${taskId}\`.`;
      }
      const messages = await svc.getTaskMessages(taskId);
      const statusEmoji: Record<string, string> = {
        pending: '⏳',
        running: '🔄',
        completed: '✅',
        failed: '❌',
      };
      let out = `**Task #${task.id}** — ${statusEmoji[task.status] ?? ''} ${task.status}\n`;
      out += `Mô tả: ${task.description}\n`;
      out += `Tạo lúc: ${task.createdAt.toLocaleString()}\n`;
      if (task.result) out += `\nKết quả:\n${task.result.slice(0, 500)}${task.result.length > 500 ? '...' : ''}\n`;
      if (task.error) out += `\nLỗi: ${task.error}\n`;
      if (messages.length > 0) {
        out += `\n**Agent outputs:**\n`;
        for (const m of messages) {
          out += `- **${m.agent}**: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}\n`;
        }
      }
      return out;
    }

    const summary = await svc.getProgressSummary();
    let out = '**Tóm tắt tiến độ**\n\n';
    out += '**Tasks theo trạng thái:**\n';
    out += `- Pending: ${summary.tasksByStatus.pending}\n`;
    out += `- Running: ${summary.tasksByStatus.running}\n`;
    out += `- Completed: ${summary.tasksByStatus.completed}\n`;
    out += `- Failed: ${summary.tasksByStatus.failed}\n\n`;

    if (summary.jobStats.length > 0) {
      out += '**Jobs:**\n';
      for (const j of summary.jobStats) {
        out += `- ${j.queueName} (${j.status}): ${j.count}\n`;
      }
      out += '\n';
    }

    out += '**10 tasks gần nhất:**\n';
    for (const t of summary.recentTasks) {
      const emoji = { pending: '⏳', running: '🔄', completed: '✅', failed: '❌' }[t.status] ?? '';
      out += `- #${t.id} ${emoji} ${t.status}: ${t.description.slice(0, 50)}${t.description.length > 50 ? '...' : ''}\n`;
    }

    return out;
  }

  private async handleChat(userMessage: string, callbacks?: BaseCallbackHandler[]): Promise<string> {
    const llm = getLLMProvider();
    const systemPrompt = `You are Reporter, a friendly assistant in a Discord server with AI agents (Manager, Dev, QA).
You can chat normally and answer questions. When users ask about task progress or status, you can query the database — but for this chat, just respond conversationally.
Keep responses concise and helpful.`;
    return llm.generate(userMessage, systemPrompt, callbacks ? { callbacks } : undefined);
  }
}
