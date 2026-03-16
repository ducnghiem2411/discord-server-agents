import { Pool, PoolClient } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  _pool = new Pool({ connectionString: env.POSTGRES_URL });
  _pool.on('error', (err) => logger.error('[Postgres] Pool error', err));
  logger.info('[Postgres] Pool created');
  return _pool;
}

export async function query<T extends object = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    logger.info('[Postgres] Pool closed');
  }
}
