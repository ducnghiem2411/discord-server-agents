/**
 * pgvector `embeddings.vector` dimension — must match Ollama embedding model output
 * (default `nomic-embed-text` via env `OLLAMA_EMBEDDING_MODEL`).
 */
export const EMBEDDING_VECTOR_DIMENSION = 768 as const;
