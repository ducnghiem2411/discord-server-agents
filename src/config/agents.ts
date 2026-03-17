import { env } from './env.js';

/** Fixed order for fallback when mention order cannot be determined. Extensible. */
export const AGENT_HIERARCHY = ['manager', 'dev', 'qa'] as const;

export type AgentName = (typeof AGENT_HIERARCHY)[number];

/** Map Discord bot user IDs (from env) to agent names. */
export function getBotIdToAgent(): Record<string, AgentName> {
  return {
    [env.MANAGER_BOT_CLIENT_ID]: 'manager',
    [env.DEV_BOT_CLIENT_ID]: 'dev',
    [env.QA_BOT_CLIENT_ID]: 'qa',
  };
}

/**
 * Resolve pipeline from message content and mentioned bot IDs.
 * Default: mention order (order of @mentions in content).
 * Fallback: hierarchy order filtered by mentioned bots.
 */
export function getPipelineFromMentions(
  content: string,
  mentionedBotIds: string[],
): AgentName[] {
  const botIdToAgent = getBotIdToAgent();

  // Parse <@userId> in order from content
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

  // If we got a valid order from mentions, use it
  if (mentionOrder.length > 0) {
    return mentionOrder;
  }

  // Fallback: hierarchy order, filtered by which bots were mentioned
  const mentionedAgents = new Set(
    mentionedBotIds.map((id) => botIdToAgent[id]).filter(Boolean),
  );
  return AGENT_HIERARCHY.filter((a) => mentionedAgents.has(a));
}
