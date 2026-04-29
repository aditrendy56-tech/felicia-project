-- Migration: create felicia_action_executions
-- Date: 2026-04-30

CREATE TABLE IF NOT EXISTS public.felicia_action_executions (
  id bigserial PRIMARY KEY,
  user_id text,
  action_name text NOT NULL,
  params jsonb,
  source text,
  thread_id uuid,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_felicia_action_executions_action_name ON public.felicia_action_executions(action_name);
CREATE INDEX IF NOT EXISTS idx_felicia_action_executions_user_id ON public.felicia_action_executions(user_id);
