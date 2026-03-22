import { CallbackHandler } from '@langfuse/langchain';
import { env } from '../config/env.js';

let _handler: CallbackHandler | undefined;

export interface LangfuseHandlerParams {
  sessionId?: string;
  userId?: string;
  tags?: string[];
  traceMetadata?: Record<string, unknown>;
}

function isLangfuseEnabled(): boolean {
  return Boolean(env.LANGFUSE_SECRET_KEY && env.LANGFUSE_PUBLIC_KEY);
}

/**
 * Creates a Langfuse CallbackHandler with optional context attributes.
 * Returns undefined when Langfuse is not configured.
 */
export function createLangfuseHandler(params?: LangfuseHandlerParams): CallbackHandler | undefined {
  if (!isLangfuseEnabled()) return undefined;
  return new CallbackHandler(params ?? {});
}

/**
 * Returns the default Langfuse CallbackHandler when LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY
 * are configured. Otherwise returns undefined (no tracing).
 */
export function getLangfuseHandler(): CallbackHandler | undefined {
  if (_handler !== undefined) return _handler;

  if (isLangfuseEnabled()) {
    _handler = new CallbackHandler();
  }

  return _handler;
}

/**
 * Flushes any buffered Langfuse events. Call before process exit for short-lived apps.
 * Long-running apps typically don't need this; the OTEL SDK handles batching.
 * The v5 CallbackHandler may not expose flushAsync; OTEL sdk.shutdown() handles flushing.
 */
export async function shutdownLangfuse(): Promise<void> {
  const handler = _handler;
  const h = handler as unknown as { flushAsync?: () => Promise<void> };
  if (handler && typeof h?.flushAsync === 'function') {
    await h.flushAsync();
  }
}
