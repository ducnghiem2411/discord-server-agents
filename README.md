# Discord Server Agents

A Discord-based AI workspace where a human user can assign tasks to multiple AI agents. Agents collaborate to complete tasks and report results back to Discord.

## Architecture

```
Discord User
    ↓
/task command or @mention
    ↓
Discord Bot (discord.js)
    ↓
PostgreSQL (tasks, jobs, messages)
    ↓
Worker Process (polling)
    ↓
┌─────────────┬──────────────┬──────────────┐
│ Manager     │    Dev       │     QA       │
│ Agent       │    Agent     │    Agent     │
│ (Planning)  │   (Code)     │  (Review)    │
└─────────────┴──────────────┴──────────────┘
    ↓
Discord (results posted as embeds)
```

## Tech Stack

| Layer          | Technology                        |
|----------------|-----------------------------------|
| Bot            | discord.js v14                    |
| Agent Framework| LangGraphJS                       |
| Queue          | PostgreSQL (jobs table, polling)  |
| Database       | PostgreSQL + pgvector             |
| LLM            | OpenAI / Anthropic / Qwen        |
| Runtime        | Node.js + TypeScript              |

## Prerequisites

- Node.js 18+
- PostgreSQL 15+ with pgvector extension
- A Discord application and bot token

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo>
cd discord-server-agents
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable            | Description                                      |
|---------------------|--------------------------------------------------|
| `DISCORD_TOKEN`     | Bot token from Discord Developer Portal          |
| `DISCORD_CLIENT_ID` | Application ID from Discord Developer Portal     |
| `DISCORD_GUILD_ID`  | Your server (guild) ID                           |
| `POSTGRES_URL`      | PostgreSQL connection string                     |
| `LLM_PROVIDER`      | `openai`, `anthropic`, `qwen`, or `gemini`       |
| `OPENAI_API_KEY`    | OpenAI key (if using OpenAI)                     |
| `ANTHROPIC_API_KEY` | Anthropic key (if using Anthropic)               |
| `QWEN_API_KEY`      | Qwen/DashScope key (if using Qwen)               |
| `GEMINI_API_KEY`    | Google AI key (if using Gemini)                  |
| `LANGFUSE_SECRET_KEY` | Langfuse secret key (optional — tracing)      |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key (optional — tracing)      |

### 3. Prepare the database

For first-time setup or when deploying to a new environment:

```bash
npm run setup
```

This ensures the pgvector extension is enabled, runs migrations, and verifies PostgreSQL connectivity.

To run only the database migration:

```bash
npm run db:migrate
```

### 4. Register Discord slash commands

```bash
npm run register-commands
```

Run this once to register `/task` and `/status` with your guild.

### 5. Start the application

Development (bot + worker in one process):

```bash
npm run dev
```

Production (build then start):

```bash
npm run build
npm start
```

## Deploy / New environment

When deploying to a new server or setting up a fresh system, run once before starting the app:

```bash
npm run setup
```

This will:

- Ensure the pgvector extension is enabled (with install instructions if missing)
- Run database migrations (create tables)
- Verify PostgreSQL connectivity

Then start the app with `npm start` or `npm run dev`.

## Slash Commands

### `/task <description>`

Assign a task to the agent team. The agents run sequentially:

1. **Manager Agent** — analyzes the request and creates an execution plan
2. **Dev Agent** — implements the solution based on the plan
3. **QA Agent** — reviews the implementation for bugs and improvements

Each agent's output is posted as a Discord embed in the channel.

**Example:**

```
/task build a simple express server with a health check endpoint
```

### `/status <task_id>`

Check the current status of a task by its numeric ID.

## Switching LLM Providers

Change the `LLM_PROVIDER` environment variable — no code changes needed:

```bash
# Use OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Use Anthropic
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Use Qwen
LLM_PROVIDER=qwen
QWEN_API_KEY=sk-...

# Use Gemini
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
```

## Observability (Langfuse)

Optional: Add [Langfuse](https://langfuse.com/) for tracing, cost tracking, and debugging LLM calls:

```
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

With these set, every LLM generation and LangGraph workflow run is traced to your Langfuse project.

## Project Structure

```
src/
├── config/
│   └── env.ts              # Zod-validated environment variables
├── discord/
│   ├── bot.ts              # Discord client, event handlers, result posting
│   ├── commands.ts         # Slash command definitions (/task, /status)
│   └── register.ts         # One-time command registration script
├── agents/
│   ├── manager.ts          # Manager Agent (planning)
│   ├── dev.ts              # Dev Agent (implementation)
│   └── qa.ts               # QA Agent (review)
├── graph/
│   └── workflow.ts         # LangGraph state machine (manager→dev→qa)
├── llm/
│   ├── provider.ts         # LLMProvider interface
│   ├── langfuse.ts         # Langfuse CallbackHandler (optional tracing)
│   ├── openai.ts           # OpenAI implementation
│   ├── anthropic.ts        # Anthropic implementation
│   ├── qwen.ts             # Qwen implementation
│   ├── gemini.ts           # Gemini implementation
│   └── index.ts            # Provider factory (env-based selection)
├── memory/
│   ├── postgres.ts         # PostgreSQL pool + query helpers
│   ├── vector.ts           # pgvector store/search helpers
│   └── migrate.ts          # DB schema migration script
├── queue/
│   └── worker.ts           # Job processor (polls PostgreSQL jobs table)
├── services/
│   ├── task.service.ts     # Task CRUD + job dispatch
│   ├── job.service.ts      # Job queue (enqueue, claim, complete)
│   └── agent.service.ts    # Agent workflow orchestration
├── types/
│   ├── agent.ts            # Agent + AgentResult interfaces
│   └── task.ts             # Task + TaskJobData types
├── utils/
│   └── logger.ts           # Lightweight structured logger
└── index.ts                # Application entry point
```

## Database Schema

```sql
tasks       — id (BIGSERIAL), description, status, result, error, discord_*, created_at, updated_at
jobs        — id (BIGSERIAL), task_id, queue_name, data (JSONB), status, attempts, error, created_at
agents      — id, name, description
messages    — id, task_id, agent, content, created_at
embeddings  — id, content, metadata, vector (1536-dim), created_at
```

## Future Improvements

- Agent memory: retrieve past relevant tasks via semantic search before each run
- Planning Agent: additional orchestration layer for complex multi-step workflows
- Code execution sandbox: safely run generated code and return stdout
- Agent-to-agent communication: agents can query each other during execution
- Monitoring dashboard: task history, agent performance metrics
- Multi-guild support: per-guild configuration and isolation
# discord-server-agents
