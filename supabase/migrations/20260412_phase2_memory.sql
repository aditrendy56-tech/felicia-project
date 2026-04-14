-- Phase 2 Memory Migration (additive, backward-compatible)
-- Jalankan di Supabase SQL Editor.
-- Aman: hanya ADD COLUMN / CREATE INDEX / CREATE TABLE IF NOT EXISTS.

begin;

alter table if exists public.felicia_memories
  add column if not exists topic_key text,
  add column if not exists memory_type text,
  add column if not exists source text,
  add column if not exists version integer,
  add column if not exists supersedes_id bigint null;

-- Constraint memory_type (idempotent dengan DO block)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'felicia_memories_memory_type_check'
  ) then
    alter table public.felicia_memories
      add constraint felicia_memories_memory_type_check
      check (memory_type in ('state', 'delta') or memory_type is null);
  end if;
end $$;

-- FK opsional untuk supersedes_id ke tabel sendiri
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'felicia_memories_supersedes_id_fkey'
  ) then
    alter table public.felicia_memories
      add constraint felicia_memories_supersedes_id_fkey
      foreign key (supersedes_id) references public.felicia_memories(id)
      on delete set null;
  end if;
exception
  when undefined_column then
    -- Jika kolom id belum ada / tipe tidak cocok, skip FK tanpa menggagalkan migrasi
    null;
end $$;

create index if not exists idx_felicia_memories_topic_created_at
  on public.felicia_memories(topic_key, created_at desc);

create index if not exists idx_felicia_memories_memory_type_created_at
  on public.felicia_memories(memory_type, created_at desc);

-- Backfill ringan dari format lama STATE[...] / DELTA[...]
update public.felicia_memories
set
  memory_type = case
    when content ~* '^STATE\[' then 'state'
    when content ~* '^DELTA\[' then 'delta'
    else memory_type
  end,
  topic_key = case
    when content ~* '^(STATE|DELTA)\[[^\]]+\]' then regexp_replace(content, '^(STATE|DELTA)\[([^\]]+)\].*$', '\2', 'i')
    else topic_key
  end,
  source = coalesce(source, 'chat'),
  version = coalesce(version, 1)
where memory_type is null
   or topic_key is null
   or source is null
   or version is null;

-- Repeat tracker global (opsional, tapi disiapkan di phase 2)
create table if not exists public.felicia_memory_repeats (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  normalized_key text not null,
  repeat_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, normalized_key)
);

create index if not exists idx_felicia_memory_repeats_user_seen
  on public.felicia_memory_repeats(user_id, last_seen_at desc);

commit;
