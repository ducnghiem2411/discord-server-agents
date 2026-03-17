/**
 * Setup script for new deployments.
 * Run before first start or when deploying to a new environment:
 *   npm run setup
 */
import '../src/config/env.js';
import { ensurePgvector, runMigration } from '../src/memory/migrate.js';
import { getPool, closePool } from '../src/memory/postgres.js';
import { logger } from '../src/utils/logger.js';

async function verifyPostgreSQL(): Promise<void> {
  logger.info('[Setup] Verifying PostgreSQL...');
  const pool = getPool();
  await pool.query('SELECT 1');
  logger.info('[Setup] PostgreSQL OK');
}

async function main(): Promise<void> {
  logger.info('[Setup] Starting setup...');

  await ensurePgvector();
  await runMigration();
  await verifyPostgreSQL();

  await closePool();

  logger.info('[Setup] Setup complete — database ready');
}

main().catch((error) => {
  logger.error('[Setup] Setup failed', error);
  process.exit(1);
});
