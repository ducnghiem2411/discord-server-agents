import './config/env.js';
import { env } from './config/env.js';
import { AgentBot } from './discord/AgentBot.js';
import { commands } from './discord/commands.js';
import { startManagerWorker, startDevWorker, startQAWorker } from './queue/worker.js';
import { getPool, closePool } from './memory/postgres.js';
import { closeQueues } from './queue/queues.js';
import { TaskService } from './services/task.service.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  logger.info('[App] Starting Discord Agent System...');

  // Verify database connectivity
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    logger.info('[App] PostgreSQL connected');
  } catch (error) {
    logger.error('[App] Failed to connect to PostgreSQL', error);
    process.exit(1);
  }

  // Create and start 3 AgentBot instances
  const managerBot = new AgentBot({
    name: 'Manager',
    token: env.MANAGER_BOT_TOKEN,
    clientId: env.MANAGER_BOT_CLIENT_ID,
  });

  const devBot = new AgentBot({
    name: 'Dev',
    token: env.DEV_BOT_TOKEN,
    clientId: env.DEV_BOT_CLIENT_ID,
  });

  const qaBot = new AgentBot({
    name: 'QA',
    token: env.QA_BOT_TOKEN,
    clientId: env.QA_BOT_CLIENT_ID,
  });

  // ManagerBot: slash commands + @mention handler
  managerBot.enableSlashCommands(commands);
  managerBot.onMention(async (description, channelId) => {
    const messageId = await managerBot.postTaskReceived(channelId, description);
    const taskService = TaskService.getInstance();
    await taskService.createAndQueueTask({
      description,
      discordChannelId: channelId,
      discordMessageId: messageId,
    });
  });

  await Promise.all([managerBot.start(), devBot.start(), qaBot.start()]);

  // Start 3 workers with pipeline
  const managerWorker = startManagerWorker(managerBot);
  const devWorker = startDevWorker(devBot);
  const qaWorker = startQAWorker(qaBot);

  logger.info('[App] System ready — 3 bots and 3 workers running');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`[App] Received ${signal}, shutting down...`);
    await Promise.all([managerWorker.close(), devWorker.close(), qaWorker.close()]);
    await Promise.all([managerBot.stop(), devBot.stop(), qaBot.stop()]);
    await closePool();
    await closeQueues();
    logger.info('[App] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('[App] Fatal startup error', error);
  process.exit(1);
});
