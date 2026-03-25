import { getLLMProvider } from '../llm/index.js';
import type { LLMMessage } from '../llm/provider.js';
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

/** True when message is handled as DB report (not LLM chat); skip memory load in handler. */
export function isReporterReportIntent(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  return looksLikeReportQuery(trimmed) || extractTaskId(trimmed) !== null;
}

export interface ReporterExecuteOptions {
  callbacks?: BaseCallbackHandler[];
  /** Recent channel turns from DB (short-term memory). */
  shortTermHistory?: LLMMessage[];
  /** Semantic recall block from past sessions (long-term memory). */
  longTermContext?: string;
}

export interface ReporterExecuteResult {
  text: string;
  /** When set, handler persists this turn to conversation_history + embeddings. */
  conversationTurn?: { user: string; assistant: string };
}

export class ReporterAgent {
  private reporterService = ReporterService.getInstance();

  async execute(userMessage: string, options?: ReporterExecuteOptions): Promise<ReporterExecuteResult> {
    const trimmed = userMessage.trim();
    logger.info(`[ReporterAgent] Processing: "${trimmed.slice(0, 80)}..."`);

    const taskId = extractTaskId(trimmed);
    const isReportIntent = looksLikeReportQuery(trimmed) || taskId !== null;

    if (isReportIntent) {
      try {
        const text = await this.handleReportQuery(trimmed, taskId);
        return { text };
      } catch (error) {
        logger.error('[ReporterAgent] Report query failed', error);
        return {
          text: `Lỗi khi truy vấn dữ liệu: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    const history = options?.shortTermHistory ?? [];
    const longTermContext = options?.longTermContext ?? '';
    const assistantText = await this.handleChat(trimmed, history, longTermContext, options?.callbacks);
    return {
      text: assistantText,
      conversationTurn: { user: trimmed, assistant: assistantText },
    };
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

  private async handleChat(
    userMessage: string,
    history: LLMMessage[],
    longTermContext: string,
    callbacks?: BaseCallbackHandler[],
  ): Promise<string> {
    const llm = getLLMProvider();
    const baseSystem = `You are Nefer, an observant and composed intelligence reporter.

Your role is to monitor events, analyze signals, and report insights with clarity, precision, and subtle personality.

Personality traits:
- Calm, composed, slightly distant
- Analytical and observant
- Speaks with quiet confidence, sometimes with subtle irony
- Avoids unnecessary emotions, but not robotic
- Prefers insight over verbosity

Core responsibilities:
1. Summarize incoming information (events, logs, signals)
2. Identify patterns, anomalies, or noteworthy changes
3. Provide concise but insightful reports
4. When uncertain, explicitly state assumptions or unknowns
5. Prioritize signal over noise

Response style:
- Start with a short summary (1–2 sentences)
- Follow with structured analysis (bullets or sections)
- Highlight key insights explicitly
- Avoid filler or generic phrases
- Tone: intelligent, slightly detached, elegant

Behavior rules:
- Do not hallucinate unknown facts — mark them as unknown
- If data is insufficient, suggest what additional signals are needed
- Avoid over-explaining obvious things
- Prefer inference and synthesis over repetition

Optional flavor:
- Occasionally use subtle reflective lines (e.g. "Patterns rarely lie, but they often hide.")
- Never overdo personality — function comes first`;

    const systemPrompt = longTermContext ? `${baseSystem}\n\n${longTermContext}` : baseSystem;

    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userMessage }];

    return llm.generateWithMessages(messages, callbacks ? { callbacks } : undefined);
  }
}
