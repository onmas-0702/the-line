-- 더 라인 — 댓글 신고·사용자 차단
--
-- 앱스토어·구글 플레이 심사 필수 항목(사용자가 글을 남기는 앱):
--   · 신고   — 회원이 댓글을 신고하면 채널 운영진(공지 권한)이 스튜디오 > 신고 탭에서 확인하고 숨기거나 넘깁니다.
--              서로 다른 회원 3명이 신고하면 운영진이 보기 전에도 자동으로 숨깁니다.
--   · 차단   — 회원이 다른 회원을 차단하면 그 사람의 댓글이 내 화면에서 보이지 않습니다(마이 페이지 > 계정에서 풀기).
--   · 숨김   — 숨긴 댓글(comments.hidden_at)은 누구에게도 보이지 않고, 운영진이 "다시 보이기"로 되돌릴 수 있습니다.
--
-- 0025 다음에 실행하세요. 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────
-- 1. 댓글 숨김
-- ─────────────────────────────────────────────
alter table comments add column if not exists hidden_at timestamptz;

-- 숨긴 댓글은 쓴 사람과 그 채널의 공지 권한 운영진만 읽을 수 있습니다(나머지에게는 아예 내려가지 않음).
drop policy if exists "comments_public_read" on comments;
create policy "comments_public_read" on comments
  for select using (hidden_at is null or user_id = auth.uid() or has_channel_permission(channel_id, 'community'));

-- ─────────────────────────────────────────────
-- 2. 댓글 신고
-- ─────────────────────────────────────────────
create table if not exists comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade, -- 댓글의 채널(아래 트리거가 채움)
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'hate', 'sexual', 'other')),
  detail text check (detail is null or char_length(detail) <= 200),
  status text not null default 'open' check (status in ('open', 'hidden', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (comment_id, reporter_id) -- 한 사람이 같은 댓글을 두 번 신고하지 않게
);

create index if not exists comment_reports_channel_status_idx on comment_reports (channel_id, status, created_at desc);

-- 채널은 신고한 사람이 정하지 않고 댓글에서 가져옵니다. 자기 댓글은 신고할 수 없습니다.
create or replace function comment_reports_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target comments%rowtype;
begin
  select * into target from comments where id = new.comment_id;
  if not found then
    raise exception 'comment_not_found';
  end if;
  if target.user_id = new.reporter_id then
    raise exception 'own_comment';
  end if;
  new.channel_id := target.channel_id;
  new.status := 'open';
  new.resolved_at := null;
  new.resolved_by := null;
  return new;
end;
$$;

drop trigger if exists comment_reports_fill on comment_reports;
create trigger comment_reports_fill
  before insert on comment_reports
  for each row execute function comment_reports_fill();

-- 서로 다른 3명이 신고하면 자동으로 숨깁니다(운영진이 "문제없음"으로 되돌릴 수 있음).
create or replace function comment_reports_auto_hide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from comment_reports where comment_id = new.comment_id and status = 'open') >= 3 then
    update comments set hidden_at = coalesce(hidden_at, now()) where id = new.comment_id;
  end if;
  return new;
end;
$$;

drop trigger if exists comment_reports_auto_hide on comment_reports;
create trigger comment_reports_auto_hide
  after insert on comment_reports
  for each row execute function comment_reports_auto_hide();

alter table comment_reports enable row level security;

-- 신고는 로그인한 본인 이름으로만
drop policy if exists "comment_reports_self_insert" on comment_reports;
create policy "comment_reports_self_insert" on comment_reports
  for insert with check (reporter_id = auth.uid());

-- 내가 한 신고, 또는 그 채널의 공지 권한 운영진
drop policy if exists "comment_reports_read" on comment_reports;
create policy "comment_reports_read" on comment_reports
  for select using (reporter_id = auth.uid() or has_channel_permission(channel_id, 'community'));

-- 처리(숨기기·문제없음)는 아래 함수로만 합니다(댓글 숨김과 신고 상태를 한 번에 바꾸려고).

-- ─────────────────────────────────────────────
-- 3. 신고 처리 — action: 'hide'(댓글 숨기기) | 'dismiss'(문제없음 — 댓글 다시 보이기)
-- ─────────────────────────────────────────────
create or replace function resolve_comment_reports(target_comment uuid, action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target comments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if action not in ('hide', 'dismiss') then
    raise exception 'unknown_action';
  end if;
  select * into target from comments where id = target_comment;
  if not found then
    raise exception 'comment_not_found';
  end if;
  if not has_channel_permission(target.channel_id, 'community') then
    raise exception 'not_allowed';
  end if;

  update comments
    set hidden_at = case when action = 'hide' then coalesce(hidden_at, now()) else null end
    where id = target_comment;

  update comment_reports
    set status = case when action = 'hide' then 'hidden' else 'dismissed' end,
        resolved_at = now(),
        resolved_by = auth.uid()
    where comment_id = target_comment;
end;
$$;

revoke all on function resolve_comment_reports(uuid, text) from public, anon;
grant execute on function resolve_comment_reports(uuid, text) to authenticated;

-- ─────────────────────────────────────────────
-- 4. 사용자 차단 — 차단한 사람의 댓글은 내 화면에서 빠집니다.
-- ─────────────────────────────────────────────
create table if not exists user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade, -- 이름을 함께 불러오려고 profiles를 가리킴
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table user_blocks enable row level security;

drop policy if exists "user_blocks_self_read" on user_blocks;
create policy "user_blocks_self_read" on user_blocks for select using (blocker_id = auth.uid());

drop policy if exists "user_blocks_self_insert" on user_blocks;
create policy "user_blocks_self_insert" on user_blocks for insert with check (blocker_id = auth.uid());

drop policy if exists "user_blocks_self_delete" on user_blocks;
create policy "user_blocks_self_delete" on user_blocks for delete using (blocker_id = auth.uid());
