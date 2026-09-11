-- 은혜의 밤 더 라인 — 초기 스키마
-- 오디오 나눔(설교/묵상 녹음)과 배경음악 라이브러리를 저장하는 테이블 + 스토리지 버킷.
-- Supabase SQL Editor에서 그대로 실행하거나, Supabase MCP가 연결되면 그대로 적용할 수 있습니다.

create extension if not exists pg_trgm;

-- ─────────────────────────────────────────────
-- 1. 오디오 나눔 테이블
-- ─────────────────────────────────────────────
create table if not exists audios (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  pastor_name text,
  church text,
  scripture_reference text,      -- 예: "시편 23:1-6"
  category text,                 -- 예: "새벽기도", "주일설교" 등 (lib/mockData.js의 CATEGORY_OPTIONS 참고)
  tags text[] not null default '{}',
  description text,
  duration_seconds numeric,
  audio_url text not null,
  audio_file_name text,
  audio_mime_type text default 'audio/wav',
  has_script boolean not null default false,
  script_url text,
  script_file_name text,
  plays integer not null default 0,
  source text check (source in ('recorded', 'uploaded')),
  created_by uuid references auth.users(id),  -- 로그인 연동 전까지는 null 허용
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(pastor_name, '') || ' ' ||
      coalesce(church, '') || ' ' ||
      coalesce(scripture_reference, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      array_to_string(coalesce(tags, '{}'), ' ')
    )
  ) stored
);

create index if not exists audios_search_idx on audios using gin (search_vector);
create index if not exists audios_tags_idx on audios using gin (tags);
create index if not exists audios_title_trgm_idx on audios using gin (title gin_trgm_ops);
create index if not exists audios_created_at_idx on audios (created_at desc);

-- ─────────────────────────────────────────────
-- 2. 배경음악 — 개인 라이브러리 (공식 라이브러리는 코드에 고정된 읽기 전용 목록)
-- ─────────────────────────────────────────────
create table if not exists background_tracks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  audio_url text not null,
  audio_file_name text,
  duration_seconds numeric,
  owner_id uuid references auth.users(id),  -- 로그인 연동 전까지는 null = 공용 보관함
  created_at timestamptz not null default now()
);

create index if not exists background_tracks_created_at_idx on background_tracks (created_at desc);

-- ─────────────────────────────────────────────
-- 3. updated_at 자동 갱신
-- ─────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists audios_set_updated_at on audios;
create trigger audios_set_updated_at
  before update on audios
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- 4. 스토리지 버킷
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('background-music', 'background-music', true)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- 5. RLS — 지금은 로그인이 아직 실제로 붙어있지 않은 와이어프레임 단계라
--    임시로 누구나 읽고 쓸 수 있게 열어둡니다.
--    ⚠️ Supabase Auth 연동 후에는 반드시 아래 정책을 owner/created_by 기준으로 좁혀야 합니다
--       (예: created_by = auth.uid() 인 행만 수정/삭제 가능하도록).
-- ─────────────────────────────────────────────
alter table audios enable row level security;
alter table background_tracks enable row level security;

drop policy if exists "audios_public_read" on audios;
create policy "audios_public_read" on audios for select using (true);

drop policy if exists "audios_public_insert" on audios;
create policy "audios_public_insert" on audios for insert with check (true);

drop policy if exists "audios_public_update" on audios;
create policy "audios_public_update" on audios for update using (true);

drop policy if exists "background_tracks_public_read" on background_tracks;
create policy "background_tracks_public_read" on background_tracks for select using (true);

drop policy if exists "background_tracks_public_insert" on background_tracks;
create policy "background_tracks_public_insert" on background_tracks for insert with check (true);

drop policy if exists "background_tracks_public_delete" on background_tracks;
create policy "background_tracks_public_delete" on background_tracks for delete using (true);

-- 버킷을 public = true로 만들어 읽기는 이미 열려있으므로, 업로드/삭제만 허용해주면 됩니다.
drop policy if exists "audio_bucket_public_insert" on storage.objects;
create policy "audio_bucket_public_insert" on storage.objects
  for insert with check (bucket_id in ('audio', 'background-music'));

drop policy if exists "audio_bucket_public_delete" on storage.objects;
create policy "audio_bucket_public_delete" on storage.objects
  for delete using (bucket_id in ('audio', 'background-music'));
