-- ═══ Dear Days · Supabase setup ═══
-- Run this once in your Supabase project: Dashboard → SQL Editor → paste → Run.

-- profile
create table if not exists profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Naira',
  updated_at bigint not null default 0
);
-- companion
create table if not exists companion (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Mochi',
  love integer not null default 0,
  updated_at bigint not null default 0
);
-- days (mood + diary note per date)
create table if not exists days (
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  mood text,
  note text,
  updated_at bigint not null default 0,
  primary key (user_id, date)
);
-- special days / memories (recur yearly)
create table if not exists memories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  title text not null,
  kind text not null,
  deleted boolean not null default false,
  updated_at bigint not null default 0
);
-- plans / events
create table if not exists events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  time text,
  title text not null,
  deleted boolean not null default false,
  updated_at bigint not null default 0
);
-- voice notes (audio lives in the storage bucket)
create table if not exists voice_notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  path text,
  mime text,
  duration integer,
  deleted boolean not null default false,
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- ── Row Level Security: each user sees ONLY their own rows ──
alter table profile enable row level security;
alter table companion enable row level security;
alter table days enable row level security;
alter table memories enable row level security;
alter table events enable row level security;
alter table voice_notes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profile','companion','days','memories','events','voice_notes'] loop
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ── Storage bucket for voice notes (private) ──
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

drop policy if exists "own voice files select" on storage.objects;
drop policy if exists "own voice files insert" on storage.objects;
drop policy if exists "own voice files update" on storage.objects;
drop policy if exists "own voice files delete" on storage.objects;
create policy "own voice files select" on storage.objects for select
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own voice files insert" on storage.objects for insert
  with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own voice files update" on storage.objects for update
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own voice files delete" on storage.objects for delete
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);
