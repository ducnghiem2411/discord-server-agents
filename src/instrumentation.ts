import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

let sdk: NodeSDK | null = null;

if (env.LANGFUSE_SECRET_KEY && env.LANGFUSE_PUBLIC_KEY) {
  logger.info('Initializing Langfuse instrumentation', {
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    baseUrl: env.LANGFUSE_BASE_URL ?? 'default',
  });
  sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
  });
  sdk.start();
}

export { sdk };
