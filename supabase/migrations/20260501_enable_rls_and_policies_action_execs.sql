-- Migration: enable RLS + policies + indexes for felicia_action_executions & felicia_pending_confirmations
-- Date: 2026-05-01

-- ENABLE RLS
ALTER TABLE IF EXISTS public.felicia_action_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.felicia_pending_confirmations ENABLE ROW LEVEL SECURITY;

-- Policies: users can only operate on rows with matching user_id
-- action_executions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='felicia_action_executions' AND policyname='select_own_action_executions'
  ) THEN
    CREATE POLICY select_own_action_executions
      ON public.felicia_action_executions FOR SELECT
      USING (auth.uid()::text = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='felicia_action_executions' AND policyname='insert_own_action_executions'
  ) THEN
    CREATE POLICY insert_own_action_executions
      ON public.felicia_action_executions FOR INSERT
      WITH CHECK (auth.uid()::text = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='felicia_action_executions' AND policyname='update_own_action_executions'
  ) THEN
    CREATE POLICY update_own_action_executions
      ON public.felicia_action_executions FOR UPDATE
      USING (auth.uid()::text = user_id)
      WITH CHECK (auth.uid()::text = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='felicia_action_executions' AND policyname='delete_own_action_executions'
  ) THEN
    CREATE POLICY delete_own_action_executions
      ON public.felicia_action_executions FOR DELETE
      USING (auth.uid()::text = user_id);
  END IF;
END$$;

-- pending_confirmations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='felicia_pending_confirmations' AND policyname='select_own_pending_confirmations'
  ) THEN
    CREATE POLICY select_own_pending_confirmations
      ON public.felicia_pending_confirmations FOR SELECT
      USING (auth.uid()::text = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='felicia_pending_confirmations' AND policyname='insert_own_pending_confirmations'
  ) THEN
    CREATE POLICY insert_own_pending_confirmations
      ON public.felicia_pending_confirmations FOR INSERT
      WITH CHECK (auth.uid()::text = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='felicia_pending_confirmations' AND policyname='delete_own_pending_confirmations'
  ) THEN
    CREATE POLICY delete_own_pending_confirmations
      ON public.felicia_pending_confirmations FOR DELETE
      USING (auth.uid()::text = user_id);
  END IF;
END$$;

-- Unique partial index for idempotency_key (action_executions)
CREATE UNIQUE INDEX IF NOT EXISTS ux_felicia_action_executions_idempotency
  ON public.felicia_action_executions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Add/check status constraint on action_executions (safe: create only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_action_execution_status'
  ) THEN
    ALTER TABLE public.felicia_action_executions
      ADD CONSTRAINT chk_action_execution_status
      CHECK (status IN ('pending','running','success','failed','cancelled'));
  END IF;
END$$;

-- Optional: add FK to felicia_chat_threads if table exists and constraint missing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='felicia_chat_threads') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_exec_thread'
    ) THEN
      ALTER TABLE public.felicia_action_executions
        ADD CONSTRAINT fk_exec_thread FOREIGN KEY (thread_id)
        REFERENCES public.felicia_chat_threads(id) ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

-- Optional indexes for pending_confirmations
CREATE INDEX IF NOT EXISTS idx_felicia_pending_confirmations_expires ON public.felicia_pending_confirmations(expires_at);
