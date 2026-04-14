-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Felicia — Chat Threads + Messages Tables
-- Jalankan di Supabase SQL Editor
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. Tabel thread percakapan (utama / refleksi / strategi)
CREATE TABLE IF NOT EXISTS felicia_chat_threads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_type TEXT NOT NULL DEFAULT 'utama' CHECK (chat_type IN ('utama', 'refleksi', 'strategi')),
  title TEXT NOT NULL DEFAULT 'New Chat',
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabel pesan per thread
CREATE TABLE IF NOT EXISTS felicia_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES felicia_chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  action TEXT,
  params JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_chat_threads_type ON felicia_chat_threads(chat_type);
CREATE INDEX IF NOT EXISTS idx_chat_threads_last_msg ON felicia_chat_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON felicia_chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON felicia_chat_messages(created_at DESC);

-- 4. Enable RLS (optional tapi recommended)
ALTER TABLE felicia_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE felicia_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: service role bisa akses semua
-- Drop dulu kalau sudah ada, lalu buat ulang
DROP POLICY IF EXISTS "Service role full access threads" ON felicia_chat_threads;
CREATE POLICY "Service role full access threads"
  ON felicia_chat_threads FOR ALL
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access messages" ON felicia_chat_messages;
CREATE POLICY "Service role full access messages"
  ON felicia_chat_messages FOR ALL
  USING (true) WITH CHECK (true);
