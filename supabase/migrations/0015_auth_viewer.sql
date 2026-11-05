-- 더 라인 — 로그인 연동 + 사용자 등급(2026-11 결정)
--
--   방문자(비로그인) / 회원(무료 가입) / 구독자(플랫폼 유료 구독, 월 5천·연 5만) /
--   채널운영자(채널 역할 + 채널운영 요금제 월 1만·연 10만 — 다음 단계)
--
-- 유료 구독은 "플랫폼 전체" 단위이고 수익은 전부 플랫폼 것입니다(정산 없음). 나중에 채널별
-- 구독으로 넓힐 수 있도록 구독 행에 channel_id(범위) 칸만 미리 둡니다(null = 플랫폼 전체).
-- 0006, 0007 다음에 실행하세요. 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────
-- 1. 프로필 — 트리거(0007) 이전에 가입한 사용자가 있으면 채워 넣고, 댓글이 작성자 이름을
--    함께 불러올 수 있게(comments → profiles) 관계를 만듭니다.
-- ─────────────────────────────────────────────
insert into profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'name', split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comments_user_profile_fkey') then
    alter table comments
      add constraint comments_user_profile_fkey foreign key (user_id) references profiles(id) on delete cascade;
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 2. 요금제 — 구독(membership)과 채널운영(studio)을 나눕니다.
-- ─────────────────────────────────────────────
alter table plans
  add column if not exists kind text not null default 'membership'
    check (kind in ('membership', 'studio')),
  add column if not exists description text;

insert into plans (code, name, kind, price_krw, billing_interval, limits, is_active, description) values
  ('membership_monthly', '구독 (월간)', 'membership', 5000, 'month', '{}', true,
   'My Page(운영자 공지·담아두기·감상일기)와 오픈채팅 커뮤니티'),
  ('membership_yearly', '구독 (연간)', 'membership', 50000, 'year', '{}', true,
   '월간보다 두 달 무료'),
  -- 채널운영은 다음 단계 — 행만 만들어 두고 판매하지 않습니다(is_active = false).
  ('studio_monthly', '채널운영 (월간)', 'studio', 10000, 'month', '{"channels": 1}', false, '나만의 스튜디오와 채널'),
  ('studio_yearly', '채널운영 (연간)', 'studio', 100000, 'year', '{"channels": 1}', false, '나만의 스튜디오와 채널')
on conflict (code) do update set
  name = excluded.name, kind = excluded.kind, price_krw = excluded.price_krw,
  billing_interval = excluded.billing_interval, limits = excluded.limits, description = excluded.description;

-- ─────────────────────────────────────────────
-- 3. 구독 — 한 사람이 "구독"과 "채널운영"을 동시에 가질 수 있게 합니다.
-- ─────────────────────────────────────────────
alter table member_subscriptions drop constraint if exists member_subscriptions_user_id_key;

alter table member_subscriptions
  add column if not exists kind text not null default 'membership' check (kind in ('membership', 'studio')),
  -- 범위: null = 플랫폼 전체(지금), 값이 있으면 그 채널만(나중에 채널별 구독을 열 때)
  add column if not exists channel_id uuid references channels(id) on delete cascade,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists note text;          -- 예: 'manual: 운영자 지급'

create unique index if not exists member_subscriptions_user_kind_scope_idx
  on member_subscriptions (user_id, kind, channel_id) nulls not distinct;

-- 본인 구독 상태는 본인이 읽을 수 있게(My Page·결제 화면). 쓰기는 여전히 서버(service role)만.
drop policy if exists "member_subscriptions_self_read" on member_subscriptions;
create policy "member_subscriptions_self_read" on member_subscriptions
  for select using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- 4. 등급 판단 함수
-- ─────────────────────────────────────────────
create or replace function has_active_plan(target_user uuid, plan_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from member_subscriptions s
    where s.user_id = target_user
      and s.kind = plan_kind
      and s.channel_id is null
      and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

create or replace function is_subscriber(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user is not null and has_active_plan(target_user, 'membership');
$$;

-- 0007의 is_paid_member는 이제 "구독자"를 뜻합니다(기존 호출 호환).
create or replace function is_paid_member(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_subscriber(target_user);
$$;

-- 구독자 전용 기능(공지·오픈채팅·담아두기·감상일기)을 쓸 수 있는지 — 구독자 또는 채널 운영자.
create or replace function has_subscriber_access(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user is not null and (
    is_subscriber(target_user)
    or exists (select 1 from channel_members m where m.user_id = target_user)
  );
$$;

-- 지금 로그인한 사람의 정보 한 묶음 — 앱의 Viewer(lib/access.js)가 이걸로 만들어집니다.
create or replace function current_viewer()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when auth.uid() is null then null else json_build_object(
    'user_id', auth.uid(),
    'display_name', (select p.display_name from profiles p where p.id = auth.uid()),
    'is_subscriber', is_subscriber(auth.uid()),
    'has_studio_plan', has_active_plan(auth.uid(), 'studio'),
    'subscription', (
      select json_build_object(
        'plan_code', s.plan_code,
        'status', s.status,
        'current_period_end', s.current_period_end
      )
      from member_subscriptions s
      where s.user_id = auth.uid() and s.kind = 'membership' and s.channel_id is null
      order by s.updated_at desc
      limit 1
    ),
    'owned_channel_count', (
      select count(*) from channel_members m where m.user_id = auth.uid() and m.role = 'owner'
    ),
    'channel_roles', coalesce((
      select json_object_agg(m.channel_id, m.role) from channel_members m where m.user_id = auth.uid()
    ), '{}'::json)
  ) end;
$$;

grant execute on function current_viewer() to anon, authenticated;
grant execute on function is_subscriber(uuid) to anon, authenticated;
grant execute on function has_subscriber_access(uuid) to anon, authenticated;
