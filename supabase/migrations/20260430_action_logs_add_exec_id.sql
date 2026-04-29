-- Migration: add action_execution_id to felicia_action_logs
-- Date: 2026-04-30

ALTER TABLE IF EXISTS public.felicia_action_logs
  ADD COLUMN IF NOT EXISTS action_execution_id bigint;

CREATE INDEX IF NOT EXISTS idx_felicia_action_logs_execution_id ON public.felicia_action_logs(action_execution_id);
