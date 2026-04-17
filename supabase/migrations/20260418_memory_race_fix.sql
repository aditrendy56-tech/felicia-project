-- Memory Race Condition Fix
-- Mencegah concurrent duplicate writes across serverless instances
-- Jalankan di Supabase SQL Editor setelah memverifikasi struktur

begin;

-- Step 1: Buat kolom helper jika belum ada (untuk normalized_content + idempotency)
alter table if exists public.felicia_memories
  add column if not exists normalized_content text,
  add column if not exists idempotency_token uuid unique,
  add column if not exists attempt_count integer default 1;

-- Step 2: Backfill normalized_content dari content yang existing
-- Normalisasi: lowercase, trim whitespace, remove special chars
update public.felicia_memories
set normalized_content = lower(trim(regexp_replace(
  coalesce(content, ''),
  '[^\w\s]',
  '',
  'g'
)))
where normalized_content is null
  and content is not null;

-- Step 3: Create UNIQUE constraint untuk mencegah concurrent duplicates
-- Constraint: (normalized_content, category, topic_key) harus unik per user
-- Catatan: Jika belum ada user_id column, gunakan (normalized_content, category, topic_key) global
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'felicia_memories_dedup_constraint'
  ) then
    alter table public.felicia_memories
      add constraint felicia_memories_dedup_constraint
      unique(normalized_content, category, topic_key);
  end if;
exception
  when undefined_column then
    -- Jika salah satu kolom belum ada, buat minimal constraint
    if not exists (
      select 1
      from pg_constraint
      where conname = 'felicia_memories_dedup_minimal'
    ) then
      alter table public.felicia_memories
        add constraint felicia_memories_dedup_minimal
        unique(normalized_content, category);
    end if;
end $$;

-- Step 4: Index untuk membantu query dedup check + recovery
create index if not exists idx_felicia_memories_normalized_cat_topic
  on public.felicia_memories(normalized_content, category, topic_key);

create index if not exists idx_felicia_memories_idempotency_token
  on public.felicia_memories(idempotency_token)
  where idempotency_token is not null;

-- Step 5: Jika ada kolom user_id, create user-scoped constraint (lebih ideal)
do $$
declare
  user_col_exists boolean;
begin
  select exists(
    select 1
    from information_schema.columns
    where table_name = 'felicia_memories' and column_name = 'user_id'
  ) into user_col_exists;

  if user_col_exists then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'felicia_memories_dedup_per_user'
    ) then
      alter table public.felicia_memories
        add constraint felicia_memories_dedup_per_user
        unique(user_id, normalized_content, category, topic_key);
    end if;
  end if;
exception
  when others then
    raise notice 'User-scoped constraint check: %', SQLERRM;
end $$;

-- Step 6: Auto-cleanup duplicate yang sudah exist (keep 1 per dedup key, hapus yang lama)
delete from public.felicia_memories m1
where m1.id in (
  select m2.id
  from public.felicia_memories m2
  where (m2.normalized_content, m2.category, m2.topic_key) in (
    select normalized_content, category, topic_key
    from public.felicia_memories
    group by normalized_content, category, topic_key
    having count(*) > 1
  )
  and m2.created_at not in (
    select max(created_at)
    from public.felicia_memories
    where (normalized_content, category, topic_key) = (m2.normalized_content, m2.category, m2.topic_key)
  )
  limit 500  -- Safety limit untuk avoid long-running migration
);

commit;

-- Catatan pasca-migrasi:
-- 1. Verifikasi tidak ada duplicate: SELECT COUNT(*), normalized_content FROM felicia_memories GROUP BY normalized_content HAVING COUNT(*) > 1;
-- 2. Monitor: aplikasi sekarang WAJIB generate idempotency_token sebelum insert
-- 3. App-layer: retry dengan idempotency_token yang sama akan return existing record, bukan duplicate
