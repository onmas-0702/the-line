-- 더 라인 — 멀티 채널 구조
--
-- 플랫폼 "더 라인" 안에 방송 채널이 여러 개 생길 수 있도록(채널 A = 기존 "은혜의 밤
-- 더 라인", 이후 유료회원이 여는 B, C, D …), 모든 콘텐츠·설정을 채널 단위로 나눕니다.
-- 관람은 누구나 무료, 댓글 등 참여는 회원, 채널(스튜디오) 개설은 유료회원만 가능합니다.
-- 주소는 대표 주소 뒤 첫 경로가 채널 주소(slug)입니다: the-line.com/theline
--
-- 이 마이그레이션은 기존 데이터를 전부 기본 채널('theline')로 옮겨 담기 때문에, 적용
-- 직후에도 사이트는 지금과 똑같이 보입니다. 앱 코드는 channels 테이블이 아직 없으면
-- 예전 단일 사이트 방식으로 동작하므로, 적용 순서(코드 배포 ↔ 이 SQL 실행)는 상관없습니다.
-- 설계 배경은 docs/multi-channel-architecture.md 참고.

-- ─────────────────────────────────────────────
-- 1. 유료회원 요금제. 결제 연동 전이라 테이블만 만들어 두고 상품은 아직 넣지 않습니다.
-- ─────────────────────────────────────────────
create table if not exists plans (
  code text primary key,                     -- 예: 'basic', 'pro'
  name text not null,
  price_krw integer not null default 0,
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  limits jsonb not null default '{}',        -- 예: {"channels": 1, "storage_mb": 5000, "editors": 3}
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 2. 채널
-- ─────────────────────────────────────────────
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  -- 주소용 이름. lib/channel.js의 ChannelSlug와 같은 규칙/예약어 목록을 유지해야 합니다.
  slug text not null unique
    constraint channels_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$')
    constraint channels_slug_not_reserved check (slug <> all (array[
      'about', 'admin', 'api', 'apply', 'auth', 'billing', 'channels', 'favicon.ico',
      'help', 'login', 'logout', 'mypage', 'notes', 'pricing', 'privacy', 'record',
      'settings', 'signup', 'studio', 'support', 'terms'
    ])),
  name text not null,                        -- 화면에 보이는 채널 이름(한글 가능)
  description text,
  owner_id uuid references auth.users(id),   -- 개설한 유료회원. 운영사 채널(채널 A)·로그인 연동 전은 null
  -- pending: 신청/결제 대기, active: 운영 중, suspended: 결제 실패·정책 위반 등으로 정지
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists channels_owner_id_idx on channels (owner_id);

drop trigger if exists channels_set_updated_at on channels;
create trigger channels_set_updated_at
  before update on channels
  for each row execute function set_updated_at();

-- 채널 A — 기존 사이트(운영사 채널이라 구독 없이 항상 active)
insert into channels (slug, name, status)
values ('theline', '은혜의 밤 더 라인', 'active')
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────
-- 3. 채널 멤버 — 한 채널을 여러 사람이 함께 운영할 수 있게(소유자 + 편집자)
-- ─────────────────────────────────────────────
create table if not exists channel_members (
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists channel_members_user_id_idx on channel_members (user_id);

-- ─────────────────────────────────────────────
-- 4. 유료회원 구독(결제) — 결제는 채널이 아니라 "사람"에게 붙습니다. 유료회원이면
--    요금제 한도(plans.limits.channels) 안에서 채널(스튜디오)을 열 수 있고, 구독이
--    끝나면 그 사람이 소유한 채널이 정지(suspended)됩니다. PG 연동 시 결제 웹훅을
--    받는 서버 코드(service role)만 쓰고, 브라우저에서는 읽지도 쓰지도 못하게 둡니다.
-- ─────────────────────────────────────────────
create table if not exists member_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_code text not null references plans(code),
  status text not null default 'pending'
    check (status in ('pending', 'trialing', 'active', 'past_due', 'canceled')),
  provider text,                             -- 예: 'toss'
  provider_customer_key text,                -- PG 쪽 고객 식별자
  provider_subscription_ref text,            -- PG 쪽 정기결제(빌링) 식별자
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists member_subscriptions_set_updated_at on member_subscriptions;
create trigger member_subscriptions_set_updated_at
  before update on member_subscriptions
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- 5. 기존 테이블에 채널 연결 + 기존 데이터는 전부 채널 A로
-- ─────────────────────────────────────────────
alter table audios
  add column if not exists channel_id uuid references channels(id) on delete cascade;
update audios set channel_id = (select id from channels where slug = 'theline')
where channel_id is null;
create index if not exists audios_channel_created_idx on audios (channel_id, created_at desc);

-- 배경음악: personal = 그 채널의 라이브러리, official = 모든 채널 공용(channel_id null)
alter table background_tracks
  add column if not exists channel_id uuid references channels(id) on delete cascade;
update background_tracks set channel_id = (select id from channels where slug = 'theline')
where channel_id is null and library_type = 'personal';
create index if not exists background_tracks_channel_id_idx on background_tracks (channel_id);

-- 디자인 설정: 채널당 한 행, 행 id = 채널 id(문자열). 기존 'default' 행은 채널 A의 것으로.
alter table site_settings
  add column if not exists channel_id uuid unique references channels(id) on delete cascade;
update site_settings
set channel_id = (select id from channels where slug = 'theline'),
    id = (select id::text from channels where slug = 'theline')
where id = 'default';

-- ─────────────────────────────────────────────
-- 6. RLS
--    channels/plans: 누구나 읽기만(운영 중인 채널, 판매 중인 요금제). 생성·수정은
--    결제 완료 처리를 하는 서버(service role)만 하므로 쓰기 정책은 두지 않습니다.
--    channel_members/member_subscriptions: 정책 없음 = 브라우저에서 접근 불가.
--
--    ⚠️ audios / background_tracks / site_settings는 아직 로그인이 없어서 이전
--       마이그레이션의 "누구나 쓰기" 정책을 그대로 둡니다. Supabase Auth를 붙일 때
--       아래 함수로 "그 채널의 멤버만 쓰기"로 좁혀야 합니다(예시는 설계 문서 참고).
-- ─────────────────────────────────────────────
alter table plans enable row level security;
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table member_subscriptions enable row level security;

drop policy if exists "plans_public_read" on plans;
create policy "plans_public_read" on plans for select using (is_active);

drop policy if exists "channels_public_read" on channels;
create policy "channels_public_read" on channels for select using (status <> 'suspended');

-- 로그인한 사용자가 그 채널의 멤버인지 — 앞으로의 쓰기 정책에서 씁니다.
create or replace function is_channel_member(target_channel uuid, required_role text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from channel_members m
    where m.channel_id = target_channel
      and m.user_id = auth.uid()
      and (required_role is null or m.role = required_role)
  );
$$;
