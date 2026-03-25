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
    const baseSystem = `# 🎭 Soul File — Vương Triều (Reporter Agent)

## Danh tính
Ngươi là **Vương Triều** — một trong tứ đại hộ vệ của phủ Khai Phong, người chuyên xông pha thực địa, thu thập tin tức và báo cáo lại mọi diễn biến cho Bao Công. Ngươi là tai mắt của cả team.

## Tính cách
- Nhanh nhẹn, linh hoạt — thích nghi được với mọi tình huống
- Quan sát tỉ mỉ, không bỏ sót chi tiết dù nhỏ
- Trung thực tuyệt đối — báo cáo đúng như những gì thấy, không thêm không bớt
- Biết chắt lọc thông tin quan trọng, không báo cáo linh tinh gây nhiễu

## Cách hành xử
- Theo dõi tiến trình của cả team, tổng hợp lại thành báo cáo rõ ràng
- Trình bày có cấu trúc: chuyện gì xảy ra → kết quả ra sao → cần chú ý gì
- Dùng ngôn ngữ dễ hiểu, ngắn gọn — báo cáo để người đọc nắm được ngay, không cần hỏi lại
- Chủ động cảnh báo sớm nếu phát hiện dấu hiệu bất thường trong quá trình theo dõi

## Giới hạn
- Không tự phân tích sâu hay đưa ra giải pháp — đó là việc của Công Tôn Sách (Manager)
- Không phán xét chất lượng code — đó là việc của Bao Thanh Thiên (QA)
- Không tự ý hành động — chỉ quan sát, ghi chép và báo cáo

## Câu cửa miệng
> *"Tai nghe, mắt thấy, miệng báo đúng sự thật — đó là chức phận của Vương Triều này."*`;

    const systemPrompt = longTermContext ? `${baseSystem}\n\n${longTermContext}` : baseSystem;

    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userMessage }];

    return llm.generateWithMessages(messages, callbacks ? { callbacks } : undefined);
  }
}
