/**
 * Database migration script.
 * Run once to set up the schema:
 *   npm run db:migrate
 */
import { getPool, closePool } from './postgres.js';
import { logger } from '../utils/logger.js';

const MIGRATION_SQL = `
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

async function migrate(): Promise<void> {
  logger.info('[Migrate] Running database migration...');
  const pool = getPool();
  await pool.query(MIGRATION_SQL);
  logger.info('[Migrate] Migration completed successfully');
  await closePool();
}

migrate().catch((error) => {
  logger.error('[Migrate] Migration failed', error);
  process.exit(1);
});
