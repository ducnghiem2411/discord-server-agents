import { query, withTransaction } from './postgres.js';
import { storeEmbedding, findSimilarConversationForUser } from './vector.js';
import { embedTextForMemory } from '../llm/embeddings.js';
import type { LLMMessage } from '../llm/provider.js';
import { logger } from '../utils/logger.js';

interface ConversationRow {
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
}

/**
 * Load recent chat turns for a Discord channel (short-term memory for Reporter).
 * `maxTurns` is the max number of user+assistant pairs (up to 2 * maxTurns rows).
 */
export async function getRecentHistory(
  channelId: string,
  maxTurns = 10,
): Promise<LLMMessage[]> {
  const limit = Math.max(1, maxTurns) * 2;
  const rows = await query<ConversationRow>(
    `SELECT role, content, created_at
     FROM conversation_history
     WHERE discord_channel_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [channelId, limit],
  );
  const chronological = [...rows].reverse();
  return chronological.map((r) => ({
    role: r.role,
    content: r.content,
  }));
}

/**
 * Build a text block from semantically similar past user messages (long-term memory).
 */
export async function findSimilarHistory(
  userId: string,
  currentUserMessage: string,
  topK = 3,
): Promise<string> {
  const vector = await embedTextForMemory(currentUserMessage);
  if (!vector) return '';

  const results = await findSimilarConversationForUser(vector, userId, topK + 2, 0.72);
  const trimmed = currentUserMessage.trim();
  const filtered = results.filter(
    (r) => r.content.trim() !== trimmed && r.similarity < 0.999,
  ).slice(0, topK);

  if (filtered.length === 0) return '';

  const lines: string[] = [
    'The following past exchanges with this user may be relevant (semantic recall from earlier sessions):',
  ];
  for (const r of filtered) {
    const snippet =
      typeof r.metadata.assistantSnippet === 'string'
        ? r.metadata.assistantSnippet
        : undefined;
    lines.push(`- User said: ${r.content.slice(0, 400)}${r.content.length > 400 ? '…' : ''}`);
    if (snippet) {
      lines.push(`  You (Reporter) replied: ${snippet.slice(0, 300)}${snippet.length > 300 ? '…' : ''}`);
    }
  }
  lines.push('Use this only if it helps continuity; ignore if off-topic.');

  logger.debug(`[ConversationMemory] Long-term hits: ${filtered.length}`);
  return lines.join('\n');
}

/**
 * Persist a completed user+assistant turn and index the user message for long-term recall.
 */
export async function saveMessages(
  userId: string,
  channelId: string,
  userMsg: string,
  assistantMsg: string,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO conversation_history (discord_user_id, discord_channel_id, role, content)
       VALUES ($1, $2, 'user', $3)`,
      [userId, channelId, userMsg],
    );
    await client.query(
      `INSERT INTO conversation_history (discord_user_id, discord_channel_id, role, content)
       VALUES ($1, $2, 'assistant', $3)`,
      [userId, channelId, assistantMsg],
    );
  });

  const vector = await embedTextForMemory(userMsg);
  if (vector) {
    await storeEmbedding(userMsg, vector, {
      type: 'conversation',
      userId,
      channelId,
      assistantSnippet: assistantMsg.slice(0, 500),
    });
  }
}
