export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt?: Date;
  discordChannelId?: string;
  discordMessageId?: string;
  result?: string;
  error?: string;
}

export interface ManagerJobData {
  taskId: string;
  description: string;
  channelId: string;
  messageId: string;
}

export interface DevJobData extends ManagerJobData {
  managerOutput: string;
}

export interface QAJobData extends DevJobData {
  devOutput: string;
}

/** @deprecated Use ManagerJobData for manager-tasks queue */
export interface TaskJobData {
  taskId: string;
  description: string;
  discordChannelId: string;
  discordMessageId: string;
}
