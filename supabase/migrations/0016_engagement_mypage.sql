-- 더 라인 — 참여(한줄평·좋아요·담아두기·감상일기) + My Page(운영자 공지·오픈채팅)
--
--   · 한줄평·이모지 댓글  — 회원 이상(comments, 0007). 여기서 길이를 100자로 줄입니다.
--   · 좋아요              — 회원 이상
--   · 담아두기·감상일기   — 구독자(또는 채널 운영자)
--   · 운영자 공지·오픈채팅 — 구독자가 읽고, 채널 운영자가 씁니다
-- 0015_auth_viewer.sql 다음에 실행하세요. 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────
-- 1. 한줄평 길이 — 앞으로 쓰는 댓글만 검사합니다(not valid: 기존 행은 그대로).
-- ─────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comments_body_one_line') then
    alter table comments add constraint comments_body_one_line check (char_length(body) <= 100) not valid;
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 2. 좋아요·담아두기 — 한 사람이 한 콘텐츠에 종류별로 한 번씩.
-- ─────────────────────────────────────────────
create table if not exists audio_marks (
  user_id uuid not null references auth.users(id) on delete cascade,
  audio_id uuid not null references audios(id) on delete cascade,
  channel_id uuid references channels(id) on delete cascade,
  kind text not null check (kind in ('like', 'save')),
  created_at timestamptz not null default now(),
  primary key (user_id, audio_id, kind)
);

create index if not exists audio_marks_audio_kind_idx on audio_marks (audio_id, kind);

alter table audio_marks enable row level security;

drop policy if exists "audio_marks_self_read" on audio_marks;
create policy "audio_marks_self_read" on audio_marks for select using (user_id = auth.uid());

drop policy if exists "audio_marks_self_insert" on audio_marks;
create policy "audio_marks_self_insert" on audio_marks for insert with check (
  user_id = auth.uid()
  and (kind = 'like' or has_subscriber_access(auth.uid()))
);

drop policy if exists "audio_marks_self_delete" on audio_marks;
create policy "audio_marks_self_delete" on audio_marks for delete using (user_id = auth.uid());

-- 누가 좋아요를 눌렀는지는 숨기고 숫자만 공개합니다.
create or replace function audio_like_count(target_audio uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from audio_marks where audio_id = target_audio and kind = 'like';
$$;

grant execute on function audio_like_count(uuid) to anon, authenticated;

-- ─────────────────────────────────────────────
-- 3. 감상일기 — 오디오 콘텐츠와 짝. 본인만 읽고 씁니다.
-- ─────────────────────────────────────────────
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 콘텐츠가 지워져도 일기는 남깁니다(제목은 화면에서 "삭제된 콘텐츠"로).
  audio_id uuid references audios(id) on delete set null,
  channel_id uuid references channels(id) on delete set null,
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journal_entries_user_created_idx on journal_entries (user_id, created_at desc);
create index if not exists journal_entries_user_audio_idx on journal_entries (user_id, audio_id);

drop trigger if exists journal_entries_set_updated_at on journal_entries;
create trigger journal_entries_set_updated_at
  before update on journal_entries
  for each row execute function set_updated_at();

alter table journal_entries enable row level security;

drop policy if exists "journal_entries_self_read" on journal_entries;
create policy "journal_entries_self_read" on journal_entries for select using (user_id = auth.uid());

drop policy if exists "journal_entries_subscriber_insert" on journal_entries;
create policy "journal_entries_subscriber_insert" on journal_entries
  for insert with check (user_id = auth.uid() and has_subscriber_access(auth.uid()));

-- 구독이 끝나도 이미 쓴 일기는 읽고 고치고 지울 수 있게 둡니다.
drop policy if exists "journal_entries_self_update" on journal_entries;
create policy "journal_entries_self_update" on journal_entries for update using (user_id = auth.uid());

drop policy if exists "journal_entries_self_delete" on journal_entries;
create policy "journal_entries_self_delete" on journal_entries for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- 4. 운영자 공지 — 채널 운영자가 쓰고, 구독자가 My Page에서 읽습니다.
-- ─────────────────────────────────────────────
create table if not exists channel_notices (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 5000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists channel_notices_channel_created_idx on channel_notices (channel_id, is_pinned desc, created_at desc);

drop trigger if exists channel_notices_set_updated_at on channel_notices;
create trigger channel_notices_set_updated_at
  before update on channel_notices
  for each row execute function set_updated_at();

alter table channel_notices enable row level security;

drop policy if exists "channel_notices_subscriber_read" on channel_notices;
create policy "channel_notices_subscriber_read" on channel_notices
  for select using (has_subscriber_access(auth.uid()) or is_channel_member(channel_id));

drop policy if exists "channel_notices_member_write" on channel_notices;
create policy "channel_notices_member_write" on channel_notices
  for all using (is_channel_member(channel_id)) with check (is_channel_member(channel_id));

-- ─────────────────────────────────────────────
-- 5. 오픈채팅(커뮤니티) 참여 정보 — 채널당 한 행. site_settings는 누구나 읽을 수 있어서
--    링크가 새지 않도록 따로 둡니다.
-- ─────────────────────────────────────────────
create table if not exists channel_community (
  channel_id uuid primary key references channels(id) on delete cascade,
  open_chat_url text,                         -- 카카오톡 오픈채팅방 링크
  entry_code text,                            -- 오픈채팅방 참여코드(비밀번호)
  guide text,                                 -- 참여 안내(규칙 등)
  updated_at timestamptz not null default now()
);

drop trigger if exists channel_community_set_updated_at on channel_community;
create trigger channel_community_set_updated_at
  before update on channel_community
  for each row execute function set_updated_at();

alter table channel_community enable row level security;

drop policy if exists "channel_community_subscriber_read" on channel_community;
create policy "channel_community_subscriber_read" on channel_community
  for select using (has_subscriber_access(auth.uid()) or is_channel_member(channel_id));

drop policy if exists "channel_community_member_write" on channel_community;
create policy "channel_community_member_write" on channel_community
  for all using (is_channel_member(channel_id)) with check (is_channel_member(channel_id));
