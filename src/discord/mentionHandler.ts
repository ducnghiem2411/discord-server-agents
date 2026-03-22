import { Message } from 'discord.js';
import { getPipelineFromMentions } from '../config/agents.js';
import { JobService } from '../services/job.service.js';
import { TaskService } from '../services/task.service.js';
import { PipelineJobData } from '../types/task.js';
import { parseTaskRefs } from '../utils/taskRefs.js';
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
  postTaskReceived: (channelId: string, description: string, firstAgent: string) => Promise<string>,
): Promise<void> {
  const key = `${message.channelId}:${message.id}`;
  // #region agent log
  fetch('http://127.0.0.1:7259/ingest/c10a561b-ea24-499b-b104-580905275518',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3e870f'},body:JSON.stringify({sessionId:'3e870f',location:'mentionHandler.ts:handleMention:entry',message:'handleMention called',data:{key,hadKey:processedMessages.has(key),setSize:processedMessages.size},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
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
    const taskService = TaskService.getInstance();

    const referencedTaskIds = parseTaskRefs(description);
    let initialOutputs: Record<string, string> = {};
    if (referencedTaskIds.length > 0) {
      try {
        initialOutputs = await taskService.loadContextFromTasks(referencedTaskIds);
        logger.info(`[MentionHandler] Loaded context from tasks ${referencedTaskIds.join(', ')}`);
      } catch (refError) {
        const errMsg = refError instanceof Error ? refError.message : String(refError);
        await message.reply(errMsg);
        return;
      }
    }

    const task = await taskService.tryCreateTaskForMention(
      description,
      message.channelId,
      message.id,
      pipeline,
    );
    if (!task) return;

    const messageId = await postTaskReceived(message.channelId, description, pipeline[0]);
    await taskService.updateTaskEmbed(task.id, messageId);

    const jobData: PipelineJobData = {
      taskId: task.id,
      description: task.description,
      channelId: message.channelId,
      messageId,
      pipeline,
      currentIndex: 0,
      outputs: initialOutputs,
      traceId: crypto.randomUUID(),
      userId: message.author.id,
    };
    await JobService.getInstance().enqueue(pipeline[0], jobData);
    logger.info(`[MentionHandler] Queued task ${task.id} to ${pipeline[0]} queue`);
  } catch (error) {
    logger.error('[MentionHandler] Failed to create task', error);
    await message.reply('An error occurred while processing your request.').catch(() => {});
  }
}
