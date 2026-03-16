import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
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

    try {
      const taskService = TaskService.getInstance();
      await taskService.createAndQueueTask({
        description,
        discordChannelId: interaction.channelId,
        discordMessageId: reply.id,
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
    const taskId = interaction.options.getString('task_id', true);

    await interaction.deferReply({ ephemeral: true });

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
          { name: 'Task ID', value: task.id, inline: true },
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
