import { Message } from 'discord.js';
import { AgentBot } from './AgentBot.js';
import { ReporterAgent } from '../agents/reporter/index.js';
import { isPipelineBot } from '../config/agents.js';
import { createLangfuseHandler } from '../llm/langfuse.js';
import {
  findSimilarHistory,
  getRecentHistory,
  saveMessages,
} from '../memory/conversationMemory.js';
import { logger } from '../utils/logger.js';

const reporterAgent = new ReporterAgent();

/**
 * Handle @mention when ONLY Reporter is mentioned.
 * If any pipeline bot (Manager/Dev/QA) is also mentioned, Reporter is ignored — return early.
 */
export async function handleReporterMention(
  message: Message,
  reporterBot: AgentBot,
): Promise<void> {
  const mentionedBotIds = Array.from(message.mentions.users.keys());

  const hasPipelineBot = mentionedBotIds.some((id) => isPipelineBot(id));
  if (hasPipelineBot) {
    logger.debug('[ReporterHandler] Pipeline bot also mentioned — Reporter ignored');
    return;
  }

  const content = message.content.replace(/<@\d+>\s*/g, '').trim();
  if (!content) {
    await message.reply('Bạn muốn hỏi gì? Tôi có thể báo cáo tiến độ tasks hoặc trò chuyện.');
    return;
  }

  const langfuseHandler = createLangfuseHandler({
    sessionId: message.channelId,
    userId: message.author.id,
    tags: ['reporter'],
    traceMetadata: { agent: 'Reporter' },
  });
  const callbacks = langfuseHandler ? [langfuseHandler] : undefined;

  try {
    const [shortTermHistory, longTermContext] = await Promise.all([
      getRecentHistory(message.channelId),
      findSimilarHistory(message.author.id, content),
    ]);

    const response = await reporterAgent.execute(content, {
      callbacks,
      shortTermHistory,
      longTermContext,
    });

    const truncated =
      response.text.length > 1900
        ? response.text.slice(0, 1900) + '\n...(truncated)'
        : response.text;
    await message.reply(truncated);

    if (response.conversationTurn) {
      try {
        await saveMessages(
          message.author.id,
          message.channelId,
          response.conversationTurn.user,
          response.conversationTurn.assistant,
        );
      } catch (memErr) {
        logger.error('[ReporterHandler] Failed to persist conversation memory', memErr);
      }
    }
  } catch (error) {
    logger.error('[ReporterHandler] Error', error);
    await message.reply('Đã xảy ra lỗi khi xử lý yêu cầu.').catch(() => {});
  }
}
