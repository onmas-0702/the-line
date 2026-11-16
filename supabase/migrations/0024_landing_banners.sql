-- 더 라인 — 플랫폼 메인 배너
--
-- 플랫폼 메인(/)의 "최신 · 많이 들은 콘텐츠" 아래 배너 영역. 운영 채널의 스튜디오 "배너" 탭에서
-- 운영자가 배너 이미지(가로 5:2)와 누르면 갈 주소, 순서를 정합니다. 여러 장이면 옆으로 넘겨집니다.
--
-- 이미지는 갤러리와 같은 공개 버킷 'gallery-display'의 channels/{채널 id}/banners/{배너 id}.webp에 둡니다
-- (0019의 스토리지 정책이 그대로 적용 — 그 채널의 제작 권한이 있는 운영자만 올리고 지움).
--
-- 0019(이미지 갤러리) 다음에 실행하세요. 여러 번 실행해도 안전합니다.

create table if not exists landing_banners (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  title text not null default '',           -- 배너 위에 얹는 짧은 글(비워도 됨)
  link_url text,                            -- 누르면 갈 주소: /theline 같은 사이트 안 주소 또는 https://…
  image_url text not null,                  -- 공개 이미지 주소
  image_path text not null,                 -- 'gallery-display' 버킷 안 경로(지울 때)
  sort_order integer not null default 0,    -- 작을수록 먼저
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists landing_banners_order_idx on landing_banners (sort_order, created_at desc);

drop trigger if exists landing_banners_set_updated_at on landing_banners;
create trigger landing_banners_set_updated_at
  before update on landing_banners
  for each row execute function set_updated_at();

alter table landing_banners enable row level security;

-- 보기: 공개(active) 배너는 누구나, 숨긴 배너는 그 채널의 제작 권한이 있는 운영자만.
drop policy if exists "landing_banners_read" on landing_banners;
create policy "landing_banners_read" on landing_banners
  for select using (status = 'active' or has_channel_permission(channel_id, 'content'));

drop policy if exists "landing_banners_staff_insert" on landing_banners;
create policy "landing_banners_staff_insert" on landing_banners
  for insert with check (has_channel_permission(channel_id, 'content'));

drop policy if exists "landing_banners_staff_update" on landing_banners;
create policy "landing_banners_staff_update" on landing_banners
  for update using (has_channel_permission(channel_id, 'content'));

drop policy if exists "landing_banners_staff_delete" on landing_banners;
create policy "landing_banners_staff_delete" on landing_banners
  for delete using (has_channel_permission(channel_id, 'content'));
