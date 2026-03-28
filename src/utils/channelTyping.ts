import type { Channel } from 'discord.js';

const TYPING_REFRESH_MS = 8000;

function channelSupportsTyping(
  channel: Channel,
): channel is Channel & { sendTyping: () => Promise<void> } {
  return (
    channel.isTextBased() &&
    'sendTyping' in channel &&
    typeof (channel as { sendTyping?: unknown }).sendTyping === 'function'
  );
}

/**
 * Runs fn while refreshing Discord's typing indicator (~10s lifetime per sendTyping call).
 */
export async function withChannelTyping<T>(channel: Channel, fn: () => Promise<T>): Promise<T> {
  if (!channelSupportsTyping(channel)) {
    return fn();
  }

  await channel.sendTyping().catch(() => {});
  const intervalId = setInterval(() => {
    void channel.sendTyping().catch(() => {});
  }, TYPING_REFRESH_MS);

  try {
    return await fn();
  } finally {
    clearInterval(intervalId);
  }
}
