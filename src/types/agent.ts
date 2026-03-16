export interface Agent {
  name: string;
  execute(input: string): Promise<string>;
}

export interface AgentResult {
  agent: string;
  output: string;
  timestamp: Date;
}
