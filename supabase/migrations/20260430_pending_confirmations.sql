-- Migration: create felicia_pending_confirmations
-- Date: 2026-04-30

CREATE TABLE IF NOT EXISTS public.felicia_pending_confirmations (
  id bigserial PRIMARY KEY,
  user_id text,
  thread_id uuid,
  action_name text NOT NULL,
  params jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  cleared boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_felicia_pending_confirmations_user ON public.felicia_pending_confirmations(user_id);
CREATE INDEX IF NOT EXISTS idx_felicia_pending_confirmations_thread ON public.felicia_pending_confirmations(thread_id);
