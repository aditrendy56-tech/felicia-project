-- Retention cleanup — jalankan berkala di Supabase SQL Editor
-- atau schedule via cron/pg_cron

-- 1. Hapus command logs lebih dari 14 hari (kecuali yang quota_limited/error untuk audit)
DELETE FROM public.felicia_commands
WHERE created_at < now() - INTERVAL '14 days'
  AND status = 'success';

-- 2. Hapus command logs error/quota yang lebih dari 30 hari
DELETE FROM public.felicia_commands
WHERE created_at < now() - INTERVAL '30 days';

-- 3. Hapus mode logs lebih dari 30 hari
DELETE FROM public.felicia_modes
WHERE created_at < now() - INTERVAL '30 days';

-- 4. Compact: hapus pesan chat lama dari thread yang sudah >60 hari tidak aktif
-- (Ini opsional — uncomment jika storage mulai besar)
-- DELETE FROM public.felicia_chat_messages
-- WHERE thread_id IN (
--   SELECT id FROM public.felicia_chat_threads
--   WHERE last_message_at < now() - INTERVAL '60 days'
-- );

-- 5. Statistik setelah cleanup
SELECT 'felicia_commands' AS tabel, COUNT(*) AS rows FROM public.felicia_commands
UNION ALL
SELECT 'felicia_modes', COUNT(*) FROM public.felicia_modes
UNION ALL
SELECT 'felicia_chat_messages', COUNT(*) FROM public.felicia_chat_messages
UNION ALL
SELECT 'felicia_chat_threads', COUNT(*) FROM public.felicia_chat_threads
UNION ALL
SELECT 'felicia_memories', COUNT(*) FROM public.felicia_memories;
