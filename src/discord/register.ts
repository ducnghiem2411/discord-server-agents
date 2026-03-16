/**
 * Run this script once to register slash commands with Discord:
 *   npm run register-commands
 *
 * Registers commands for ManagerBot only (the bot that receives /task from users).
 */
import { REST, Routes } from 'discord.js';
import { env } from '../config/env.js';
import { commands } from './commands.js';
import { logger } from '../utils/logger.js';

export async function registerCommands(clientId: string, token: string): Promise<void> {
  const rest = new REST().setToken(token);
  const commandData = commands.map((c) => c.data.toJSON());

  logger.info(`[Register] Registering ${commandData.length} slash command(s) for client ${clientId}...`);

  await rest.put(Routes.applicationGuildCommands(clientId, env.DISCORD_GUILD_ID), {
    body: commandData,
  });

  logger.info('[Register] Slash commands registered successfully');
}

async function main(): Promise<void> {
  await registerCommands(env.MANAGER_BOT_CLIENT_ID, env.MANAGER_BOT_TOKEN);
}

main().catch((error) => {
  logger.error('[Register] Failed to register commands', error);
  process.exit(1);
});
