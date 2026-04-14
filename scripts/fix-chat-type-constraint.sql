-- Fix: CHECK constraint masih pakai 'curhat', harus diganti 'refleksi'
-- Jalankan di Supabase SQL Editor

-- 1. Drop constraint lama (nama constraint bisa beda, cari yang benar)
ALTER TABLE public.felicia_chat_threads 
  DROP CONSTRAINT IF EXISTS felicia_chat_threads_chat_type_check;

-- 2. Buat constraint baru dengan 'refleksi'
ALTER TABLE public.felicia_chat_threads 
  ADD CONSTRAINT felicia_chat_threads_chat_type_check 
  CHECK (chat_type IN ('utama', 'refleksi', 'strategi'));

-- 3. Update data lama kalau ada yang masih 'curhat'
UPDATE public.felicia_chat_threads 
  SET chat_type = 'refleksi' 
  WHERE chat_type = 'curhat';

-- 4. Verifikasi
SELECT conname, pg_get_constraintdef(oid) 
  FROM pg_constraint 
  WHERE conrelid = 'public.felicia_chat_threads'::regclass 
    AND contype = 'c';
