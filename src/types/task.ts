export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: number;
  description: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt?: Date;
  discordChannelId?: string;
  discordMessageId?: string;
  result?: string;
  error?: string;
}

/** Base job data for pipeline-aware routing. All queues use this shape. */
export interface PipelineJobData {
  taskId: number;
  description: string;
  channelId: string;
  messageId: string;
  pipeline: string[];
  currentIndex: number;
  outputs: Record<string, string>;
}

export type ManagerJobData = PipelineJobData;
export type DevJobData = PipelineJobData;
export type QAJobData = PipelineJobData;
