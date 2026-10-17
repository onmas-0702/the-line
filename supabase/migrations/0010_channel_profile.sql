-- 더 라인 — 채널 프로필(유튜브 채널 상단 같은 꾸미기) + 구독
--   · 대표이미지(배너, 3:1)와 소개글 — site_settings(채널당 한 행)에 추가
--   · 로고는 0009의 cover_image_url(정사각형)을 그대로 씁니다.
--   · 채널 구독 — 회원이 채널을 구독. 화면에는 구독자 수만 보여줍니다.
-- 0006_channels.sql, 0009_channel_cover_image.sql 다음에 실행하세요.

alter table site_settings
  add column if not exists banner_image_url text,
  add column if not exists description text;

comment on column site_settings.banner_image_url is '채널 대표이미지(가로 3:1, 최대 1500x500). 채널 페이지 맨 위 배너';
comment on column site_settings.description is '채널 페이지 상단의 간단한 소개글';

-- ─────────────────────────────────────────────
-- 채널 구독
-- ─────────────────────────────────────────────
create table if not exists channel_followers (
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists channel_followers_user_id_idx on channel_followers (user_id);

alter table channel_followers enable row level security;

-- 누가 어떤 채널을 구독하는지는 본인만 볼 수 있고, 다른 사람에게는 숫자만 공개합니다.
drop policy if exists "channel_followers_self_read" on channel_followers;
create policy "channel_followers_self_read" on channel_followers
  for select using (user_id = auth.uid());

drop policy if exists "channel_followers_self_insert" on channel_followers;
create policy "channel_followers_self_insert" on channel_followers
  for insert with check (user_id = auth.uid());

drop policy if exists "channel_followers_self_delete" on channel_followers;
create policy "channel_followers_self_delete" on channel_followers
  for delete using (user_id = auth.uid());

create or replace function channel_follower_count(target_channel uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from channel_followers where channel_id = target_channel;
$$;

grant execute on function channel_follower_count(uuid) to anon, authenticated;
