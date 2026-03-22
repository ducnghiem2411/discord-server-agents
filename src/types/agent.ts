import type { BaseCallbackHandler } from '@langchain/core/callbacks/base.js';

export interface AgentExecuteOptions {
  callbacks?: BaseCallbackHandler[];
}

export interface Agent {
  name: string;
  execute(input: string, options?: AgentExecuteOptions): Promise<string>;
}

export interface AgentResult {
  agent: string;
  output: string;
  timestamp: Date;
}
