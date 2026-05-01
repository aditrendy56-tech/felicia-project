-- Migration: Add normalized_content column and trigram GIN index
-- Purpose: Ensure fast ILIKE searches on normalized content for entity-based retrieval
-- Date: 2026-05-01

BEGIN;

-- Enable pg_trgm extension (needed for trigram GIN index)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add normalized_content column if it doesn't exist
ALTER TABLE IF EXISTS felicia_memories
  ADD COLUMN IF NOT EXISTS normalized_content text;

-- Backfill normalized_content for existing rows (best-effort)
-- Normalization: lowercase + remove non-alphanumeric characters + collapse whitespace
UPDATE felicia_memories
SET normalized_content = lower(regexp_replace(coalesce(content, ''), '[^a-z0-9\s]', '', 'gi'))
WHERE normalized_content IS NULL OR normalized_content = '';

-- Create a trigram GIN index to speed up ILIKE '%...%' queries on normalized_content
CREATE INDEX IF NOT EXISTS idx_felicia_memories_normalized_content_trgm
  ON felicia_memories USING gin (normalized_content gin_trgm_ops);

-- Optional performance: index on category if heavy filtering by category
CREATE INDEX IF NOT EXISTS idx_felicia_memories_category_created_at
  ON felicia_memories (category, created_at DESC);

COMMIT;

-- Notes:
-- 1) Running this migration may take time on large tables due to the UPDATE.
-- 2) Consider running the UPDATE in batches for very large datasets.
-- 3) After this, ILIKE queries on normalized_content will use the trigram index and be much faster.
