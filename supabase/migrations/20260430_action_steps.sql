-- Migration: create felicia_action_steps
-- Date: 2026-04-30
-- Purpose: Semantic step-level tracing for compound/multi-step actions
-- Allows per-step analytics, filtering, and duration insights

CREATE TABLE IF NOT EXISTS public.felicia_action_steps (
  id bigserial PRIMARY KEY,
  action_execution_id bigint NOT NULL,
  step_name text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  input jsonb,
  output jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_felicia_action_steps_execution_id ON public.felicia_action_steps(action_execution_id);
CREATE INDEX IF NOT EXISTS idx_felicia_action_steps_step_name ON public.felicia_action_steps(step_name);
CREATE INDEX IF NOT EXISTS idx_felicia_action_steps_status ON public.felicia_action_steps(status);
