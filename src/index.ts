import './config/env.js';
import { env } from './config/env.js';
import { getReporterBotId } from './config/agents.js';
import { AgentBot } from './discord/AgentBot.js';
import { commands } from './discord/commands.js';
import { handleMention } from './discord/mentionHandler.js';
import { handleReporterMention } from './discord/reporterHandler.js';
import { startManagerWorker, startDevWorker, startQAWorker } from './queue/worker.js';
import { getPool, closePool } from './memory/postgres.js';
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

  // Confirm Discord config (ensure bots are added to guild)
  logger.info(
    '[App] Discord config: guild=%s | Manager=%s | Dev=%s | QA=%s | Reporter=%s',
    env.DISCORD_GUILD_ID,
    env.MANAGER_BOT_CLIENT_ID,
    env.DEV_BOT_CLIENT_ID,
    env.QA_BOT_CLIENT_ID,
    getReporterBotId() ?? 'disabled',
  );

  // Create and start AgentBot instances
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

  const allBotConfigs = [
    { clientId: env.MANAGER_BOT_CLIENT_ID, name: 'Manager' },
    { clientId: env.DEV_BOT_CLIENT_ID, name: 'Dev' },
    { clientId: env.QA_BOT_CLIENT_ID, name: 'QA' },
  ];

  const agentToBot: Record<string, AgentBot> = {
    manager: managerBot,
    dev: devBot,
    qa: qaBot,
  };

  const postTaskReceived = (channelId: string, description: string, firstAgent: string) => {
    const bot = agentToBot[firstAgent] ?? managerBot;
    return bot.postTaskReceived(channelId, description);
  };

  const createMentionHandler = (message: import('discord.js').Message) =>
    handleMention(message, allBotConfigs, postTaskReceived);

  managerBot.enableSlashCommands(commands);
  managerBot.onMention(createMentionHandler);
  devBot.onMention(createMentionHandler);
  qaBot.onMention(createMentionHandler);

  const botsToStart: Promise<void>[] = [managerBot.start(), devBot.start(), qaBot.start()];
  const botsToStop: AgentBot[] = [managerBot, devBot, qaBot];

  let reporterBot: AgentBot | null = null;
  if (env.REPORTER_BOT_TOKEN && env.REPORTER_BOT_CLIENT_ID) {
    reporterBot = new AgentBot({
      name: 'Reporter',
      token: env.REPORTER_BOT_TOKEN,
      clientId: env.REPORTER_BOT_CLIENT_ID,
    });
    reporterBot.onMention((msg) => handleReporterMention(msg, reporterBot!));
    allBotConfigs.push({ clientId: env.REPORTER_BOT_CLIENT_ID, name: 'Reporter' });
    botsToStart.push(reporterBot.start());
    botsToStop.push(reporterBot);
    logger.info('[App] Reporter bot enabled');
  }

  await Promise.all(botsToStart);

  // Start 3 workers with pipeline (Reporter has no worker)
  const managerWorker = startManagerWorker(managerBot);
  const devWorker = startDevWorker(devBot);
  const qaWorker = startQAWorker(qaBot);

  logger.info('[App] System ready — 3 pipeline bots + 3 workers' + (reporterBot ? ' + Reporter' : ''));

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`[App] Received ${signal}, shutting down...`);
    managerWorker.stop();
    devWorker.stop();
    qaWorker.stop();
    await Promise.all(botsToStop.map((b) => b.stop()));
    await closePool();
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
