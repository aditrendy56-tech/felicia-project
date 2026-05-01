-- 2026-05-01: Add pgvector extension and embeddings for felicia_memories
-- Enable pgvector extension
-- Try to enable pgvector extension. If unavailable (permission or plan), fall back to
-- creating an array column `embedding double precision[]` so code can still store embeddings
-- but without pgvector indexing/ops. The application uses best-effort logic and will
-- continue to work with heuristics if vector operators aren't available.
DO $$
BEGIN
  -- Attempt to create extension (may fail if user lacks privileges)
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension could not be created or is not permitted: %', SQLERRM;
  END;

  -- If the 'vector' type exists, add a vector column and index; otherwise add double precision[]
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    -- Add embedding column (768 dims) for Gemini text-embedding-004
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'felicia_memories' AND column_name = 'embedding') THEN
      EXECUTE 'ALTER TABLE felicia_memories ADD COLUMN embedding vector(768)';
    END IF;

    -- Create ivfflat index for fast approximate nearest neighbor (cosine)
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'i' AND c.relname = 'idx_felicia_memories_embedding'
    ) THEN
      EXECUTE 'CREATE INDEX idx_felicia_memories_embedding ON felicia_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    END IF;
  ELSE
    -- Fallback: add a double precision array column to store embeddings when pgvector unavailable
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'felicia_memories' AND column_name = 'embedding') THEN
      EXECUTE 'ALTER TABLE felicia_memories ADD COLUMN embedding double precision[]';
    END IF;
    RAISE NOTICE 'pgvector not available; embedding column created as double precision[] (no vector index)';
  END IF;
END$$;

-- RPC: match_memories(query_embedding, match_threshold, match_count)
-- Returns nearest memories ordered by cosine similarity (similarity = 1 - distance)
-- Only create this RPC when the `vector` type is available.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    EXECUTE format($fmt$
      CREATE OR REPLACE FUNCTION match_memories(
        query_embedding vector(768),
        match_threshold double precision DEFAULT 0.60,
        match_count integer DEFAULT 10
      )
      RETURNS TABLE(id bigint, content text, category text, title text, memory_type text, similarity double precision)
      LANGUAGE sql
      AS $body$
        SELECT
          id,
          content,
          category,
          title,
          memory_type,
          (1.0 - (embedding <=> query_embedding))::double precision AS similarity
        FROM felicia_memories
        WHERE embedding IS NOT NULL
          AND (match_threshold IS NULL OR (1.0 - (embedding <=> query_embedding)) >= match_threshold)
        ORDER BY embedding <=> query_embedding
        LIMIT match_count
      $body$;
    $fmt$);
  ELSE
    RAISE NOTICE 'match_memories RPC not created because pgvector type is unavailable. App will use heuristic fallback.';
  END IF;
END$$;
