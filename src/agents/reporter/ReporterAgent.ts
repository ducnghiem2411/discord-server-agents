import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base.js';
import { getChatModel } from '../../llm/chatModelFactory.js';
import type { LLMMessage } from '../../llm/provider.js';
import { logger } from '../../utils/logger.js';
import { REPORTER_SYSTEM_PROMPT } from './prompts/system.js';
import { REPORTER_TOOL_INSTRUCTIONS } from './prompts/toolInstructions.js';
import { REPORTER_SYNTHESIS_USER } from './prompts/synthesis.js';
import { getReporterToolByName, getReporterTools, REPORT_TOOL_NAMES } from './tools/index.js';
import { aiMessageText, llmMessagesToBaseMessages, parseToolArgs } from './utils/messageHelpers.js';

export interface ReporterExecuteOptions {
  callbacks?: BaseCallbackHandler[];
  shortTermHistory?: LLMMessage[];
  longTermContext?: string;
}

export interface ReporterExecuteResult {
  text: string;
  conversationTurn?: { user: string; assistant: string };
}

export class ReporterAgent {
  async execute(userMessage: string, options?: ReporterExecuteOptions): Promise<ReporterExecuteResult> {
    const trimmed = userMessage.trim();
    logger.info(`[ReporterAgent] Processing: "${trimmed.slice(0, 80)}..."`);

    const longTermContext = options?.longTermContext ?? '';
    const systemBody = longTermContext
      ? `${REPORTER_SYSTEM_PROMPT}${REPORTER_TOOL_INSTRUCTIONS}\n\n${longTermContext}`
      : `${REPORTER_SYSTEM_PROMPT}${REPORTER_TOOL_INSTRUCTIONS}`;

    const history = options?.shortTermHistory ?? [];
    const messages: BaseMessage[] = [
      new SystemMessage(systemBody),
      ...llmMessagesToBaseMessages(history),
      new HumanMessage(trimmed),
    ];

    const runConfig =
      options?.callbacks && options.callbacks.length > 0 ? { callbacks: options.callbacks } : {};

    const model = getChatModel();
    const tools = getReporterTools();
    if (!model.bindTools) {
      throw new Error('Chat model does not support bindTools; check @langchain provider version.');
    }
    const modelWithTools = model.bindTools(tools);

    const first = await modelWithTools.invoke(messages, runConfig);
    if (!AIMessage.isInstance(first)) {
      return {
        text: 'Không nhận được phản hồi từ mô hình.',
        conversationTurn: { user: trimmed, assistant: 'Không nhận được phản hồi từ mô hình.' },
      };
    }

    const toolCalls = first.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const text = aiMessageText(first);
      if (!text) {
        return {
          text: '(Không có nội dung)',
          conversationTurn: { user: trimmed, assistant: '(Không có nội dung)' },
        };
      }
      return {
        text,
        conversationTurn: { user: trimmed, assistant: text },
      };
    }

    const usedReportTool = toolCalls.some((tc) => REPORT_TOOL_NAMES.has(tc.name));

    const toolMessages: ToolMessage[] = [];
    for (let i = 0; i < toolCalls.length; i++) {
      const call = toolCalls[i];
      const toolCallId = call.id ?? `reporter_tool_${i}`;
      const structuredTool = getReporterToolByName(call.name);
      if (!structuredTool) {
        toolMessages.push(
          new ToolMessage({
            content: JSON.stringify({ error: 'unknown_tool', name: call.name }),
            tool_call_id: toolCallId,
          }),
        );
        continue;
      }
      const args = parseToolArgs(call.args);
      try {
        const out = await structuredTool.invoke(args);
        const content = typeof out === 'string' ? out : JSON.stringify(out);
        toolMessages.push(
          new ToolMessage({
            content,
            tool_call_id: toolCallId,
          }),
        );
      } catch (err) {
        logger.error(`[ReporterAgent] Tool ${call.name} failed`, err);
        toolMessages.push(
          new ToolMessage({
            content: JSON.stringify({
              error: 'tool_failed',
              message: err instanceof Error ? err.message : String(err),
            }),
            tool_call_id: toolCallId,
          }),
        );
      }
    }

    const followUp = new HumanMessage(REPORTER_SYNTHESIS_USER);
    const second = await model.invoke([...messages, first, ...toolMessages, followUp], runConfig);

    if (!AIMessage.isInstance(second)) {
      return { text: 'Không nhận được phản hồi sau khi gọi tool.' };
    }

    const finalText = aiMessageText(second);
    const outText = finalText || '(Không có nội dung)';

    if (usedReportTool) {
      return { text: outText };
    }

    return {
      text: outText,
      conversationTurn: { user: trimmed, assistant: outText },
    };
  }
}
