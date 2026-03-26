import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  Colors,
  TextChannel,
  Message,
  ChatInputCommandInteraction,
} from 'discord.js';
import { SlashCommand } from './commands.js';
import { withChannelTyping } from '../utils/channelTyping.js';
import { logger } from '../utils/logger.js';

export interface AgentBotConfig {
  name: string;
  token: string;
  clientId: string;
}

export type MentionCallback = (message: Message) => void | Promise<void>;

/**
 * Generic Discord bot for agent posting. Each instance handles one bot identity.
 * Supports MessageCreate @mention detection and slash commands (when registered).
 */
export class AgentBot {
  private client: Client;
  private config: AgentBotConfig;
  private mentionCallback: MentionCallback | null = null;
  private ready = false;

  constructor(config: AgentBotConfig) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.registerEventHandlers();
  }

  private registerEventHandlers(): void {
    this.client.once(Events.ClientReady, (client) => {
      this.ready = true;
      logger.info(`[AgentBot:${this.config.name}] Logged in as ${client.user.tag}`);
    });

    this.client.on(Events.MessageCreate, async (message: Message) => {
      if (message.author.bot) return;

      const mention = message.mentions.users.get(this.client.user!.id);
      if (!mention) return;

      logger.info(`[AgentBot:${this.config.name}] Mention received from ${message.author.tag}`);
      // #region agent log
      fetch('http://127.0.0.1:7259/ingest/c10a561b-ea24-499b-b104-580905275518',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3e870f'},body:JSON.stringify({sessionId:'3e870f',location:'AgentBot.ts:MessageCreate',message:'Bot received mention',data:{botName:this.config.name,msgId:message.id,channelId:message.channelId},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      if (this.mentionCallback) {
        try {
          await withChannelTyping(message.channel, async () => {
            await this.mentionCallback!(message);
          });
        } catch (error) {
          logger.error(`[AgentBot:${this.config.name}] Mention callback error`, error);
          await message.reply('An error occurred while processing your request.').catch(() => {});
        }
      }
    });

    this.client.on(Events.Error, (error) => {
      logger.error(`[AgentBot:${this.config.name}] Client error`, error);
    });
  }

  /**
   * Register callback for @mention handling. Called when user mentions this bot with a task.
   */
  onMention(callback: MentionCallback): void {
    this.mentionCallback = callback;
  }

  /**
   * Enable slash commands for this bot (used by ManagerBot for /task, /status).
   */
  enableSlashCommands(commands: SlashCommand[]): void {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = commands.find((c) => c.data.name === interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction as ChatInputCommandInteraction);
      } catch (error) {
        logger.error(`[AgentBot:${this.config.name}] Error executing /${interaction.commandName}`, error);
        const reply = {
          content: 'An error occurred while executing that command.',
          ephemeral: true,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    });
  }

  async start(): Promise<void> {
    await this.client.login(this.config.token);
  }

  async stop(): Promise<void> {
    this.client.destroy();
    logger.info(`[AgentBot:${this.config.name}] Client destroyed`);
  }

  isReady(): boolean {
    return this.ready;
  }

  getClient(): Client {
    return this.client;
  }

  getClientId(): string {
    return this.config.clientId;
  }

  getName(): string {
    return this.config.name;
  }

  /**
   * Post "Task Received" embed and return the message ID (for use as messageId in job data).
   */
  async postTaskReceived(channelId: string, description: string): Promise<string> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Channel ${channelId} not found or not a text channel`);
    }
    const embed = new EmbedBuilder()
      .setTitle('Task Received')
      .setDescription(`\`\`\`\n${description}\n\`\`\``)
      .setColor(Colors.Blue)
      .addFields({ name: 'Status', value: '⏳ Queued — agents are being dispatched...' })
      .setTimestamp();
    const msg = await channel.send({ embeds: [embed] });
    return msg.id;
  }

  /**
   * Post an embed to a channel as this bot.
   */
  async postAgentResult(channelId: string, embed: EmbedBuilder): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.warn(`[AgentBot:${this.config.name}] Channel ${channelId} not found or not a text channel`);
      return;
    }
    await channel.send({ embeds: [embed] });
  }

  /**
   * Reply to the original message by editing it or sending a follow-up.
   */
  async replyToMessage(channelId: string, messageId: string, embed: EmbedBuilder): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    try {
      const originalMsg = await channel.messages.fetch(messageId);
      await originalMsg.edit({ embeds: [embed] });
    } catch {
      logger.warn(`[AgentBot:${this.config.name}] Could not update original message, sending as new`);
      await channel.send({ embeds: [embed] });
    }
  }

  /**
   * Update the original task message to completed status.
   */
  async updateTaskCompleted(channelId: string, messageId: string, description: string): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('Task Completed')
      .setDescription(`\`\`\`\n${description}\n\`\`\``)
      .setColor(Colors.Green)
      .addFields({ name: 'Status', value: '✅ Completed', inline: true })
      .setTimestamp();
    await this.replyToMessage(channelId, messageId, embed);
  }

  /**
   * Update the original task message to failed status.
   */
  async updateTaskFailed(channelId: string, messageId: string, description: string, error: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    const embed = new EmbedBuilder()
      .setTitle('Task Failed')
      .setDescription(`\`\`\`\n${description}\n\`\`\``)
      .setColor(Colors.Red)
      .addFields(
        { name: 'Status', value: '❌ Failed', inline: true },
        { name: 'Error', value: error.slice(0, 500) },
      )
      .setTimestamp();

    try {
      const originalMsg = await channel.messages.fetch(messageId);
      await originalMsg.edit({ embeds: [embed] });
    } catch {
      await channel.send({ embeds: [embed] });
    }
  }

  /**
   * Build an agent result embed (for posting individual agent outputs).
   */
  static buildAgentEmbed(agentName: string, output: string, taskId: string, timestamp?: Date): EmbedBuilder {
    const agentEmoji: Record<string, string> = {
      Manager: '🧠',
      Dev: '💻',
      QA: '🔍',
    };
    const emoji = agentEmoji[agentName] ?? '🤖';
    const truncatedOutput =
      output.length > 3900 ? output.slice(0, 3900) + '\n...(truncated)' : output;

    return new EmbedBuilder()
      .setTitle(`${emoji} ${agentName} Agent`)
      .setDescription(truncatedOutput)
      .setColor(Colors.Blurple)
      .setFooter({ text: `Task ID: ${taskId}` })
      .setTimestamp(timestamp ?? new Date());
  }
}
