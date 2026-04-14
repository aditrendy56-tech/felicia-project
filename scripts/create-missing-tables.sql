-- Create missing tables: felicia_modes dan felicia_commands
-- Jalankan di Supabase SQL Editor

-- 1. felicia_modes table — tracks mode activations
CREATE TABLE IF NOT EXISTS public.felicia_modes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mode TEXT NOT NULL,
  note TEXT,
  activated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_felicia_modes_activated_at 
  ON public.felicia_modes(activated_at DESC);

CREATE INDEX IF NOT EXISTS idx_felicia_modes_mode_activated 
  ON public.felicia_modes(mode, activated_at DESC);

ALTER TABLE public.felicia_modes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access modes" ON public.felicia_modes;
CREATE POLICY "Service role full access modes"
  ON public.felicia_modes FOR ALL
  USING (true) WITH CHECK (true);

-- 2. felicia_commands table — logs every command/request
CREATE TABLE IF NOT EXISTS public.felicia_commands (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  command TEXT NOT NULL,
  input TEXT,
  action TEXT,
  response TEXT,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_felicia_commands_user_created
  ON public.felicia_commands(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_felicia_commands_command_created
  ON public.felicia_commands(command, created_at DESC);

ALTER TABLE public.felicia_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access commands" ON public.felicia_commands;
CREATE POLICY "Service role full access commands"
  ON public.felicia_commands FOR ALL
  USING (true) WITH CHECK (true);
