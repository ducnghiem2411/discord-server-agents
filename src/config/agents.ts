import { env } from './env.js';

/** Fixed order for fallback when mention order cannot be determined. Reporter is NOT in pipeline. */
export const AGENT_HIERARCHY = ['manager', 'dev', 'qa'] as const;

export type AgentName = (typeof AGENT_HIERARCHY)[number];

/** Pipeline bot IDs (Manager, Dev, QA) — Reporter excluded. */
const PIPELINE_BOT_IDS = new Set([
  env.MANAGER_BOT_CLIENT_ID,
  env.DEV_BOT_CLIENT_ID,
  env.QA_BOT_CLIENT_ID,
]);

/** Map Discord bot user IDs (from env) to agent names. Pipeline bots only. */
export function getBotIdToAgent(): Record<string, AgentName> {
  return {
    [env.MANAGER_BOT_CLIENT_ID]: 'manager',
    [env.DEV_BOT_CLIENT_ID]: 'dev',
    [env.QA_BOT_CLIENT_ID]: 'qa',
  };
}

/** Reporter bot client ID if configured. */
export function getReporterBotId(): string | null {
  return env.REPORTER_BOT_CLIENT_ID ?? null;
}

/** Whether the given bot ID is a pipeline bot (Manager/Dev/QA). */
export function isPipelineBot(clientId: string): boolean {
  return PIPELINE_BOT_IDS.has(clientId);
}

/**
 * Resolve pipeline from message content and mentioned bot IDs.
 * Reporter is excluded — only Manager, Dev, QA participate in pipeline.
 */
export function getPipelineFromMentions(
  content: string,
  mentionedBotIds: string[],
): AgentName[] {
  const botIdToAgent = getBotIdToAgent();
  const pipelineMentionedIds = mentionedBotIds.filter((id) => isPipelineBot(id));

  const mentionRegex = /<@(\d+)>/g;
  const mentionOrder: AgentName[] = [];
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    const id = match[1];
    const agent = botIdToAgent[id] as AgentName | undefined;
    if (agent && !mentionOrder.includes(agent)) {
      mentionOrder.push(agent);
    }
  }

  if (mentionOrder.length > 0) {
    return mentionOrder;
  }

  const mentionedAgents = new Set(
    pipelineMentionedIds.map((id) => botIdToAgent[id]).filter(Boolean),
  );
  return AGENT_HIERARCHY.filter((a) => mentionedAgents.has(a));
}
