-- 더 라인 — 앱(아이폰·안드로이드) 푸시 알림 준비
--
-- 웹 푸시(0021 push_subscriptions)와 따로, 앱이 로그인한 뒤 받은 Expo 푸시 토큰을 기기마다 한 줄 저장합니다.
-- 새 콘텐츠 알림(/api/notifications/dispatch)이 웹 기기와 앱 기기에 함께 보냅니다(lib/appPush.js).
-- 받는 사람 규칙은 웹과 같습니다 — 구독자(또는 채널 운영자)만.
--
-- 0027 다음에 실행하세요. 여러 번 실행해도 안전합니다.

create table if not exists app_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  token text not null unique,               -- "ExponentPushToken[...]"
  platform text not null check (platform in ('ios', 'android')),
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists app_push_tokens_user_idx on app_push_tokens (user_id);

alter table app_push_tokens enable row level security;

drop policy if exists "app_push_tokens_self_read" on app_push_tokens;
create policy "app_push_tokens_self_read" on app_push_tokens for select using (user_id = auth.uid());

-- 등록: 로그인한 본인. (알림을 받을지는 보낼 때 구독자인지로 거릅니다 — 앱은 결제 화면이 없어서
--  구독하기 전에 등록해 두었다가 웹에서 구독하면 그때부터 받게 하려고.)
drop policy if exists "app_push_tokens_self_insert" on app_push_tokens;
create policy "app_push_tokens_self_insert" on app_push_tokens for insert with check (user_id = auth.uid());

drop policy if exists "app_push_tokens_self_update" on app_push_tokens;
create policy "app_push_tokens_self_update" on app_push_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "app_push_tokens_self_delete" on app_push_tokens;
create policy "app_push_tokens_self_delete" on app_push_tokens for delete using (user_id = auth.uid());
