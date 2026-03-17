import { Message } from 'discord.js';
import { getPipelineFromMentions } from '../config/agents.js';
import { TaskService } from '../services/task.service.js';
import { logger } from '../utils/logger.js';

const processedMessages = new Set<string>();

export interface BotConfig {
  clientId: string;
  name: string;
}

/**
 * Centralized handler for @mention. Deduplicates when multiple bots are tagged.
 * Resolves pipeline via mention order (default) or hierarchy (fallback).
 */
export async function handleMention(
  message: Message,
  allBotConfigs: BotConfig[],
  postTaskReceived: (channelId: string, description: string) => Promise<string>,
): Promise<void> {
  const key = `${message.channelId}:${message.id}`;
  if (processedMessages.has(key)) {
    logger.debug(`[MentionHandler] Skipping duplicate message ${key}`);
    return;
  }
  processedMessages.add(key);

  const mentionedBotIds = Array.from(message.mentions.users.keys()).filter((id) =>
    allBotConfigs.some((b) => b.clientId === id),
  );

  if (mentionedBotIds.length === 0) {
    return;
  }

  const pipeline = getPipelineFromMentions(message.content, mentionedBotIds);
  if (pipeline.length === 0) {
    logger.warn('[MentionHandler] No valid pipeline from mentions');
    return;
  }

  const description = message.content.replace(/<@\d+>\s*/g, '').trim();
  if (!description) {
    await message.reply('Please provide a task description after the mention.');
    return;
  }

  logger.info(`[MentionHandler] Pipeline: ${pipeline.join('→')} for "${description.slice(0, 50)}..."`);

  try {
    const messageId = await postTaskReceived(message.channelId, description);
    const taskService = TaskService.getInstance();
    await taskService.createAndQueueTask({
      description,
      discordChannelId: message.channelId,
      discordMessageId: messageId,
      pipeline,
    });
  } catch (error) {
    logger.error('[MentionHandler] Failed to create task', error);
    await message.reply('An error occurred while processing your request.').catch(() => {});
  }
}
