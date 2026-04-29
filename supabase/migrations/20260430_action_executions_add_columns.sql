-- Migration: add columns to felicia_action_executions
-- Date: 2026-04-30

ALTER TABLE IF EXISTS public.felicia_action_executions
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS steps jsonb,
  ADD COLUMN IF NOT EXISTS source text;

-- optional: index for idempotency key
CREATE INDEX IF NOT EXISTS idx_felicia_action_executions_idempotency ON public.felicia_action_executions(idempotency_key);
