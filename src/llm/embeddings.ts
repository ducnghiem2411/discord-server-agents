import { env } from '../config/env.js';
import { EMBEDDING_VECTOR_DIMENSION } from '../config/embeddingDimension.js';
import { logger } from '../utils/logger.js';

interface OllamaEmbedResponse {
  embeddings?: number[][];
  embedding?: number[];
  error?: string;
}

/**
 * 768-dim embedding for pgvector `embeddings` table (Ollama nomic-embed-text by default).
 * Returns null on empty input or when Ollama is unreachable / returns an error.
 */
export async function embedTextForMemory(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const baseUrl = env.OLLAMA_BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}/api/embed`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.OLLAMA_EMBEDDING_MODEL,
        input: trimmed,
      }),
    });

    const data = (await res.json()) as OllamaEmbedResponse;

    if (!res.ok) {
      logger.warn('[Embeddings] Ollama /api/embed HTTP %s: %s', res.status, data.error ?? res.statusText);
      return null;
    }

    let vector: number[] | undefined;
    if (Array.isArray(data.embeddings) && data.embeddings.length > 0) {
      vector = data.embeddings[0];
    } else if (Array.isArray(data.embedding)) {
      vector = data.embedding;
    }

    if (!vector || vector.length === 0) {
      logger.warn('[Embeddings] Ollama returned empty embedding');
      return null;
    }

    if (vector.length !== EMBEDDING_VECTOR_DIMENSION) {
      logger.warn(
        `[Embeddings] Expected ${EMBEDDING_VECTOR_DIMENSION} dims for pgvector, got ${vector.length} — check OLLAMA_EMBEDDING_MODEL / migration`,
      );
    }

    return vector;
  } catch (error) {
    logger.error('[Embeddings] Ollama embed failed (is Ollama running?)', error);
    return null;
  }
}
