-- Felicia Action Logs (observability / black box recorder)
-- Date: 2026-04-29

CREATE TABLE IF NOT EXISTS public.felicia_action_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  source TEXT DEFAULT 'chat' NOT NULL,
  input TEXT,
  parsed_intent TEXT,
  action_executed TEXT,
  result TEXT,
  error TEXT,
  ai_provider_used TEXT,
  fallback_used BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'success',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_felicia_action_logs_user_created
  ON public.felicia_action_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_felicia_action_logs_action_created
  ON public.felicia_action_logs(action_executed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_felicia_action_logs_status_created
  ON public.felicia_action_logs(status, created_at DESC);

ALTER TABLE public.felicia_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access action logs" ON public.felicia_action_logs;
CREATE POLICY "Service role full access action logs"
  ON public.felicia_action_logs FOR ALL
  USING (true) WITH CHECK (true);
