import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { AGENT_HIERARCHY } from '../config/agents.js';
import { TaskService } from '../services/task.service.js';
import { logger } from '../utils/logger.js';

export interface SlashCommand {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export const taskCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('task')
    .setDescription('Assign a task to the AI agent team')
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Describe the task you want the agents to complete')
        .setRequired(true)
        .setMaxLength(1000),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const description = interaction.options.getString('description', true);

    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setTitle('Task Received')
      .setDescription(`\`\`\`\n${description}\n\`\`\``)
      .setColor(Colors.Blue)
      .addFields({ name: 'Status', value: '⏳ Queued — agents are being dispatched...' })
      .setTimestamp();

    const reply = await interaction.editReply({ embeds: [embed] });

    logger.info(`[Commands] /task submitted: "${description}" by ${interaction.user.tag}`);
    // #region agent log
    fetch('http://127.0.0.1:7259/ingest/c10a561b-ea24-499b-b104-580905275518',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3e870f'},body:JSON.stringify({sessionId:'3e870f',location:'commands.ts:taskCommand',message:'Slash /task executed',data:{desc:description.slice(0,30)},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    try {
      const taskService = TaskService.getInstance();
      await taskService.createAndQueueTask({
        description,
        discordChannelId: interaction.channelId,
        discordMessageId: reply.id,
        pipeline: [...AGENT_HIERARCHY],
      });
    } catch (error) {
      logger.error('[Commands] Failed to queue task', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('Task Failed to Queue')
        .setDescription('An error occurred while queuing your task. Please try again.')
        .setColor(Colors.Red)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

export const statusCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check the status of a task')
    .addStringOption((option) =>
      option
        .setName('task_id')
        .setDescription('The task ID to check')
        .setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const taskIdStr = interaction.options.getString('task_id', true);
    const taskId = parseInt(taskIdStr, 10);
    if (isNaN(taskId)) {
      await interaction.editReply({ content: `Invalid task ID: \`${taskIdStr}\`. Use a numeric ID.` });
      return;
    }

    try {
      const taskService = TaskService.getInstance();
      const task = await taskService.getTask(taskId);

      if (!task) {
        await interaction.editReply({ content: `No task found with ID \`${taskId}\`` });
        return;
      }

      const statusEmoji: Record<string, string> = {
        pending: '⏳',
        running: '🔄',
        completed: '✅',
        failed: '❌',
      };

      const embed = new EmbedBuilder()
        .setTitle('Task Status')
        .setColor(task.status === 'completed' ? Colors.Green : task.status === 'failed' ? Colors.Red : Colors.Yellow)
        .addFields(
          { name: 'Task ID', value: String(task.id), inline: true },
          { name: 'Status', value: `${statusEmoji[task.status] ?? ''} ${task.status}`, inline: true },
          { name: 'Description', value: task.description },
          { name: 'Created', value: task.createdAt.toLocaleString(), inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('[Commands] Failed to get task status', error);
      await interaction.editReply({ content: 'Failed to retrieve task status.' });
    }
  },
};

export const commands: SlashCommand[] = [taskCommand, statusCommand];
