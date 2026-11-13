-- 더 라인 — 이미지 갤러리 (구독자 이미지 다운로드 서비스)
--
-- 플랫폼 메인(/) 하단의 이미지 갤러리. 운영 채널의 스튜디오 "갤러리" 탭에서 운영자가
-- 이미지를 올리면, 누구나 썸네일·크게 보기를 볼 수 있고, 구독자만
--   · 원본 다운로드
--   · 모바일 배경이미지(휴대폰 세로 비율로 맞춘 버전) 다운로드
--   · 마이 갤러리(마이 페이지 "갤러리")에 담아두기
-- 를 할 수 있습니다.
--
-- 파일 보관
--   · 'gallery'(비공개): 원본 + 모바일 배경이미지 — 구독자만 짧게 유효한 서명 URL로 받습니다.
--   · 'gallery-display'(공개): 화면용(크게 보기) + 썸네일 — 누구나 볼 수 있습니다.
--   경로는 다른 업로드와 같이 channels/{채널 id}/gallery/{이미지 id}/… 입니다(0017의 storage_channel_id).
--
-- 0015(구독자 함수), 0018(has_channel_permission) 다음에 실행하세요. 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────
-- 0. 스토리지 경로 → 채널 id. 0017에도 있는 함수인데, 0017을 아직 실행하지 않은 DB에서도
--    이 파일이 동작하도록 같은 내용으로 다시 만듭니다(0017과 똑같아서 순서와 상관없이 안전).
-- ─────────────────────────────────────────────
create or replace function storage_channel_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(object_name, '/', 1) = 'channels'
     and split_part(object_name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 2)::uuid
  end;
$$;

-- ─────────────────────────────────────────────
-- 1. 갤러리 이미지
-- ─────────────────────────────────────────────
create table if not exists gallery_images (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  title text not null default '',
  description text,
  original_path text not null,               -- 'gallery' 버킷(비공개) 원본
  wallpaper_path text not null,              -- 'gallery' 버킷(비공개) 모바일 배경이미지
  display_url text not null,                 -- 'gallery-display' 버킷(공개) 크게 보기용
  thumb_url text not null,                   -- 'gallery-display' 버킷(공개) 정사각형 썸네일
  original_file_name text,
  width integer,                             -- 원본 크기(px)
  height integer,
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gallery_images_active_idx on gallery_images (created_at desc) where status = 'active';
create index if not exists gallery_images_channel_idx on gallery_images (channel_id);

drop trigger if exists gallery_images_set_updated_at on gallery_images;
create trigger gallery_images_set_updated_at
  before update on gallery_images
  for each row execute function set_updated_at();

alter table gallery_images enable row level security;

-- 보기: 공개된(active) 이미지는 누구나, 숨긴 이미지는 그 채널의 제작 권한이 있는 운영자만.
drop policy if exists "gallery_images_read" on gallery_images;
create policy "gallery_images_read" on gallery_images
  for select using (status = 'active' or has_channel_permission(channel_id, 'content'));

drop policy if exists "gallery_images_staff_insert" on gallery_images;
create policy "gallery_images_staff_insert" on gallery_images
  for insert with check (has_channel_permission(channel_id, 'content'));

drop policy if exists "gallery_images_staff_update" on gallery_images;
create policy "gallery_images_staff_update" on gallery_images
  for update using (has_channel_permission(channel_id, 'content'));

drop policy if exists "gallery_images_staff_delete" on gallery_images;
create policy "gallery_images_staff_delete" on gallery_images
  for delete using (has_channel_permission(channel_id, 'content'));

-- ─────────────────────────────────────────────
-- 2. 마이 갤러리 — 구독자가 담아둔 이미지
-- ─────────────────────────────────────────────
create table if not exists gallery_saves (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  image_id uuid not null references gallery_images(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, image_id)
);

create index if not exists gallery_saves_user_idx on gallery_saves (user_id, created_at desc);

alter table gallery_saves enable row level security;

drop policy if exists "gallery_saves_self_read" on gallery_saves;
create policy "gallery_saves_self_read" on gallery_saves for select using (user_id = auth.uid());

drop policy if exists "gallery_saves_subscriber_insert" on gallery_saves;
create policy "gallery_saves_subscriber_insert" on gallery_saves
  for insert with check (user_id = auth.uid() and has_subscriber_access());

drop policy if exists "gallery_saves_self_delete" on gallery_saves;
create policy "gallery_saves_self_delete" on gallery_saves for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- 3. 스토리지
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('gallery', 'gallery', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('gallery-display', 'gallery-display', true)
on conflict (id) do nothing;

-- 올리기·바꾸기·지우기: 그 채널의 제작 권한이 있는 운영자만.
drop policy if exists "gallery_buckets_staff_insert" on storage.objects;
create policy "gallery_buckets_staff_insert" on storage.objects
  for insert with check (
    bucket_id in ('gallery', 'gallery-display') and has_channel_permission(storage_channel_id(name), 'content')
  );

drop policy if exists "gallery_buckets_staff_update" on storage.objects;
create policy "gallery_buckets_staff_update" on storage.objects
  for update using (
    bucket_id in ('gallery', 'gallery-display') and has_channel_permission(storage_channel_id(name), 'content')
  );

drop policy if exists "gallery_buckets_staff_delete" on storage.objects;
create policy "gallery_buckets_staff_delete" on storage.objects
  for delete using (
    bucket_id in ('gallery', 'gallery-display') and has_channel_permission(storage_channel_id(name), 'content')
  );

-- 원본·모바일 배경이미지 받기(서명 URL 발급): 구독자(또는 채널 운영자)와 그 채널의 운영자.
drop policy if exists "gallery_bucket_subscriber_read" on storage.objects;
create policy "gallery_bucket_subscriber_read" on storage.objects
  for select using (
    bucket_id = 'gallery'
    and (has_subscriber_access() or has_channel_permission(storage_channel_id(name), 'content'))
  );

-- ─────────────────────────────────────────────
-- 4. 갤러리 주소(/gallery)를 채널 주소 예약어에 추가 — lib/channel.js의 ChannelSlug.RESERVED와 같은 목록
-- ─────────────────────────────────────────────
alter table channels drop constraint if exists channels_slug_not_reserved;
alter table channels add constraint channels_slug_not_reserved check (slug <> all (array[
  'about', 'admin', 'api', 'apple-icon', 'apply', 'auth', 'billing', 'channels', 'favicon.ico',
  'gallery', 'help', 'icon', 'login', 'logout', 'manifest.webmanifest', 'mypage', 'notes', 'pricing',
  'privacy', 'record', 'settings', 'signup', 'studio', 'support', 'terms'
]));
