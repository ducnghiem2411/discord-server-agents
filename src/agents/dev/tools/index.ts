import type { StructuredToolInterface } from '@langchain/core/tools';

/** Reserved for future Dev pipeline tools (e.g. bindTools). */
export function getDevTools(): StructuredToolInterface[] {
  return [];
}
