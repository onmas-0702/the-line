-- 더 라인 — 콘텐츠 예약 공개 + 구독자 알림
--
-- 1. 예약 공개: audios.publish_at(공개 시각). 그 시각 전에는 채널 운영자만 볼 수 있고, 시각이 되면
--    누구에게나 보입니다. 공개 여부는 DB 읽기 정책이 publish_at <= now()로 판단하므로, 따로 "공개 작업"을
--    돌리지 않아도 정확히 그 시각부터 보입니다.
-- 2. 앱 안 알림: notification_reads(사람마다 마지막으로 알림을 본 시각). 그 뒤에 공개된 콘텐츠가
--    "새 알림"입니다(lib/notifications.js의 NotificationInbox).
-- 3. 휴대폰 푸시 알림: push_subscriptions(구독자가 "휴대폰 알림 받기"를 켠 브라우저). 공개 시각이 지난
--    콘텐츠를 /api/notifications/dispatch가 한 번씩만 보내고 audios.notified_at에 표시합니다.
--
-- 0015(구독자 함수), 0018(운영자 권한) 다음에 실행하세요. 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────
-- 1. 예약 공개
-- ─────────────────────────────────────────────
alter table audios add column if not exists publish_at timestamptz;
alter table audios add column if not exists notified_at timestamptz;

-- 이미 있던 콘텐츠는 올린 시각에 공개된 것으로, 알림도 이미 보낸 것으로 칩니다(옛 콘텐츠 알림 폭탄 방지).
update audios set publish_at = coalesce(created_at, now()) where publish_at is null;
update audios set notified_at = publish_at where notified_at is null and publish_at <= now();

alter table audios alter column publish_at set default now();
alter table audios alter column publish_at set not null;

create index if not exists audios_publish_at_idx on audios (publish_at desc);
create index if not exists audios_notify_due_idx on audios (publish_at) where notified_at is null;

-- 보기: 공개 시각이 지난 콘텐츠는 누구나, 예약 중인 콘텐츠는 그 채널 운영자만.
drop policy if exists "audios_public_read" on audios;
create policy "audios_public_read" on audios
  for select using (publish_at <= now() or is_channel_member(channel_id));

-- ─────────────────────────────────────────────
-- 2. 앱 안 알림 — 마지막으로 알림을 본 시각
-- ─────────────────────────────────────────────
create table if not exists notification_reads (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  last_seen_at timestamptz not null default now()
);

alter table notification_reads enable row level security;

drop policy if exists "notification_reads_self" on notification_reads;
create policy "notification_reads_self" on notification_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- 3. 휴대폰 푸시 알림 — 알림을 켠 브라우저(기기)마다 한 행
-- ─────────────────────────────────────────────
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,          -- 브라우저 푸시 서비스 주소(기기마다 다름)
  p256dh text not null,                   -- 암호화 키
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_self_read" on push_subscriptions;
create policy "push_subscriptions_self_read" on push_subscriptions for select using (user_id = auth.uid());

-- 켜기: 구독자(또는 채널 운영자)만.
drop policy if exists "push_subscriptions_subscriber_insert" on push_subscriptions;
create policy "push_subscriptions_subscriber_insert" on push_subscriptions
  for insert with check (user_id = auth.uid() and has_subscriber_access());

drop policy if exists "push_subscriptions_self_update" on push_subscriptions;
create policy "push_subscriptions_self_update" on push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_self_delete" on push_subscriptions;
create policy "push_subscriptions_self_delete" on push_subscriptions for delete using (user_id = auth.uid());

-- 보내기(/api/notifications/dispatch)는 서버의 service role 키로 읽으므로 따로 정책이 필요 없습니다.
-- 받는 사람은 has_subscriber_access()인 사람만 — 구독이 끝나면 알림도 멈춥니다.
