import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { ManagerAgent } from '../agents/manager.js';
import { DevAgent } from '../agents/dev.js';
import { QAAgent } from '../agents/qa.js';
import { AgentResult } from '../types/agent.js';
import { logger } from '../utils/logger.js';

// Define the shared state schema for the workflow graph
const WorkflowState = Annotation.Root({
  task: Annotation<string>(),
  managerOutput: Annotation<string>(),
  devOutput: Annotation<string>(),
  qaOutput: Annotation<string>(),
  results: Annotation<AgentResult[]>({
    reducer: (existing, update) => [...(existing ?? []), ...update],
    default: () => [],
  }),
});

type WorkflowStateType = typeof WorkflowState.State;

const managerAgent = new ManagerAgent();
const devAgent = new DevAgent();
const qaAgent = new QAAgent();

async function runManager(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  logger.info('[Workflow] Running Manager node');
  const output = await managerAgent.execute(state.task);
  return {
    managerOutput: output,
    results: [{ agent: 'Manager', output, timestamp: new Date() }],
  };
}

async function runDev(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  logger.info('[Workflow] Running Dev node');
  const prompt = `Original Task: ${state.task}\n\nManager's Plan:\n${state.managerOutput}\n\nPlease implement the solution based on the plan above.`;
  const output = await devAgent.execute(prompt);
  return {
    devOutput: output,
    results: [{ agent: 'Dev', output, timestamp: new Date() }],
  };
}

async function runQA(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  logger.info('[Workflow] Running QA node');
  const prompt = `Original Task: ${state.task}\n\nManager's Plan:\n${state.managerOutput}\n\nDev Agent's Implementation:\n${state.devOutput}\n\nPlease review the implementation above.`;
  const output = await qaAgent.execute(prompt);
  return {
    qaOutput: output,
    results: [{ agent: 'QA', output, timestamp: new Date() }],
  };
}

function buildWorkflow() {
  const graph = new StateGraph(WorkflowState)
    .addNode('manager', runManager)
    .addNode('dev', runDev)
    .addNode('qa', runQA)
    .addEdge('__start__', 'manager')
    .addEdge('manager', 'dev')
    .addEdge('dev', 'qa')
    .addEdge('qa', END);

  return graph.compile();
}

const workflow = buildWorkflow();

export interface WorkflowOutput {
  results: AgentResult[];
  managerOutput: string;
  devOutput: string;
  qaOutput: string;
}

export async function runWorkflow(task: string): Promise<WorkflowOutput> {
  logger.info(`[Workflow] Starting workflow for task: "${task}"`);

  const finalState = await workflow.invoke({ task });

  logger.info('[Workflow] Workflow completed');

  return {
    results: finalState.results,
    managerOutput: finalState.managerOutput,
    devOutput: finalState.devOutput,
    qaOutput: finalState.qaOutput,
  };
}
