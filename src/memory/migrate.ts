/**
 * Database migration script.
 * Run once to set up the schema:
 *   npm run db:migrate
 */
import { getPool, closePool } from './postgres.js';
import { logger } from '../utils/logger.js';

const PGVECTOR_INSTALL_GUIDE = `
pgvector extension is not installed on the PostgreSQL server.
Install it for your platform:

  macOS (Homebrew):    brew install pgvector
  Ubuntu/Debian:       sudo apt install postgresql-XX-pgvector  (XX = PG version, e.g. 16)
  Docker:              Use image pgvector/pgvector:pg16
  See: https://github.com/pgvector/pgvector#installation
`;

export async function ensurePgvector(): Promise<void> {
  logger.info('[Migrate] Ensuring pgvector extension...');
  const pool = getPool();
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    logger.info('[Migrate] pgvector extension ready');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('could not open') ||
      msg.includes('is not available') ||
      msg.includes('does not exist') ||
      msg.includes('extension')
    ) {
      logger.error('[Migrate] %s', PGVECTOR_INSTALL_GUIDE);
    }
    throw error;
  }
}

const MIGRATION_SQL = `
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop tables if they exist (for schema change from UUID to BIGSERIAL)
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS tasks;

-- Tasks table (numeric id)
CREATE TABLE IF NOT EXISTS tasks (
  id          BIGSERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result      TEXT,
  error       TEXT,
  discord_channel_id TEXT,
  discord_message_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agents table (registry of known agents)
CREATE TABLE IF NOT EXISTS agents (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO agents (name, description) VALUES
  ('Manager', 'Analyzes tasks and creates execution plans'),
  ('Dev',     'Implements solutions and generates code'),
  ('QA',      'Reviews implementations and suggests improvements')
ON CONFLICT (name) DO NOTHING;

-- Messages table (stores per-agent outputs per task)
CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  task_id     BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jobs table (PostgreSQL-backed queue)
CREATE TABLE IF NOT EXISTS jobs (
  id          BIGSERIAL PRIMARY KEY,
  task_id     BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  queue_name  TEXT NOT NULL,
  data        JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts    INT NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_pending
  ON jobs (queue_name, id) WHERE status = 'pending';

-- Embeddings table (for semantic memory / vector search)
CREATE TABLE IF NOT EXISTS embeddings (
  id          SERIAL PRIMARY KEY,
  content     TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  vector      vector(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast ANN search
CREATE INDEX IF NOT EXISTS embeddings_vector_idx
  ON embeddings USING ivfflat (vector vector_cosine_ops)
  WITH (lists = 100);

-- Trigger to auto-update updated_at on tasks
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
`;

export async function runMigration(): Promise<void> {
  logger.info('[Migrate] Running database migration...');
  const pool = getPool();
  await pool.query(MIGRATION_SQL);
  logger.info('[Migrate] Migration completed successfully');
}

async function main(): Promise<void> {
  await ensurePgvector();
  await runMigration();
  await closePool();
}

// Only run when executed directly (npm run db:migrate), not when imported by setup.ts
const isEntryPoint = process.argv[1]?.includes('migrate');
if (isEntryPoint) {
  main().catch((error) => {
    logger.error('[Migrate] Migration failed', error);
    process.exit(1);
  });
}
