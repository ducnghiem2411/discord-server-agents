import { query } from './postgres.js';
import { logger } from '../utils/logger.js';

export interface EmbeddingRecord {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface SimilarResult extends EmbeddingRecord {
  similarity: number;
}

/**
 * Store a text embedding in the database.
 * The vector must be a 1536-dimensional float array (OpenAI ada-002 compatible).
 */
export async function storeEmbedding(
  content: string,
  vector: number[],
  metadata: Record<string, unknown> = {},
): Promise<number> {
  const vectorStr = `[${vector.join(',')}]`;
  const rows = await query<{ id: number }>(
    `INSERT INTO embeddings (content, vector, metadata)
     VALUES ($1, $2::vector, $3)
     RETURNING id`,
    [content, vectorStr, JSON.stringify(metadata)],
  );
  const id = rows[0].id;
  logger.debug(`[VectorStore] Stored embedding id=${id}`);
  return id;
}

/**
 * Find semantically similar embeddings using cosine similarity.
 */
export async function findSimilar(
  queryVector: number[],
  topK = 5,
  threshold = 0.75,
): Promise<SimilarResult[]> {
  const vectorStr = `[${queryVector.join(',')}]`;
  const rows = await query<{
    id: number;
    content: string;
    metadata: Record<string, unknown>;
    created_at: Date;
    similarity: number;
  }>(
    `SELECT id, content, metadata, created_at,
            1 - (vector <=> $1::vector) AS similarity
     FROM embeddings
     WHERE 1 - (vector <=> $1::vector) >= $2
     ORDER BY similarity DESC
     LIMIT $3`,
    [vectorStr, threshold, topK],
  );

  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    metadata: r.metadata,
    createdAt: r.created_at,
    similarity: r.similarity,
  }));
}
