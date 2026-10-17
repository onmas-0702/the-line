-- 더 라인 — 회원 프로필 + 댓글
--
-- 회원 구조(큰 틀):
--   · 비회원   — 모든 채널의 콘텐츠를 무료로 관람
--   · 회원     — 무료 가입. 댓글 등 참여 기능
--   · 유료회원 — member_subscriptions가 active인 회원. 자기 채널(스튜디오) 개설
-- 등급은 따로 저장하지 않고 "로그인 여부 + 구독 상태"에서 계산합니다(두 곳에 저장하면
-- 결제 상태와 등급이 어긋날 수 있어서). 규칙은 lib/access.js의 AccessPolicy 한 곳에 있습니다.
-- 0006_channels.sql 다음에 실행하세요.

-- ─────────────────────────────────────────────
-- 1. 회원 프로필 — Supabase Auth 가입 시 자동으로 한 행 생성
-- ─────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',     -- 댓글 등에 보이는 이름
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────
-- 2. 댓글 — 회원만 작성, 누구나 읽기
-- ─────────────────────────────────────────────
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  audio_id uuid not null references audios(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade, -- 채널 운영자의 관리용
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                      -- 지운 댓글은 "삭제된 댓글입니다"로 남김
);

create index if not exists comments_audio_created_idx on comments (audio_id, created_at);
create index if not exists comments_channel_id_idx on comments (channel_id);

drop trigger if exists comments_set_updated_at on comments;
create trigger comments_set_updated_at
  before update on comments
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- 3. 유료회원 여부 — 앞으로 채널 개설 정책 등에서 씁니다.
-- ─────────────────────────────────────────────
create or replace function is_paid_member(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from member_subscriptions s
    where s.user_id = target_user
      and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- ─────────────────────────────────────────────
-- 4. RLS — 이 테이블들은 처음부터 로그인 기준으로 엽니다(아직 로그인 화면이 없어서
--    지금은 아무도 댓글을 쓸 수 없고, 읽기만 열려 있는 상태가 됩니다).
-- ─────────────────────────────────────────────
alter table profiles enable row level security;
alter table comments enable row level security;

drop policy if exists "profiles_public_read" on profiles;
create policy "profiles_public_read" on profiles for select using (true);

drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_update" on profiles for update using (id = auth.uid());

drop policy if exists "comments_public_read" on comments;
create policy "comments_public_read" on comments for select using (true);

drop policy if exists "comments_member_insert" on comments;
create policy "comments_member_insert" on comments
  for insert with check (user_id = auth.uid());

-- 본인 댓글 수정·삭제(soft delete), 또는 그 채널 운영자의 정리
drop policy if exists "comments_author_or_channel_update" on comments;
create policy "comments_author_or_channel_update" on comments
  for update using (user_id = auth.uid() or is_channel_member(channel_id));
