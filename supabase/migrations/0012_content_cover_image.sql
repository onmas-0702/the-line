-- 더 라인 — 콘텐츠별 배경이미지
--
-- 콘텐츠마다 배경이미지(카드 표지·재생 바 이미지)를 지정합니다. 이미지는 자산
-- 라이브러리(library_assets, kind = 'background_image')에 보관되어 다음 콘텐츠에서도
-- 다시 고를 수 있고, 운영 채널이면 공용으로 공개할 수도 있습니다.
--   · 원본: 비공개 버킷 'library'에 손대지 않고 보관
--   · 화면용: 정사각형(1:1)으로 맞춘 복사본을 공개 버킷 'library-display'에 저장
--     (구독자 모두의 화면에 보여야 해서 공개. 화면에 보이는 그림은 원래 저장 가능)
--   · audios에는 고른 자산 id와 화면용 주소를 함께 저장 — 나중에 그 이미지를
--     라이브러리에서 숨겨도 콘텐츠에는 계속 보입니다.
-- 표지 순서: 콘텐츠 배경이미지 → 채널 기본 배경 이미지 → 색 그라데이션 (채널 로고는 로고 자리에만).
-- 0011_asset_library.sql 다음에 실행하세요.

alter table library_assets
  add column if not exists display_url text;  -- 화면용(정사각형) 이미지 공개 주소

comment on column library_assets.display_url is '배경이미지 자산의 화면용(1:1) 공개 주소. 원본은 storage_path(비공개)';

alter table audios
  add column if not exists cover_asset_id uuid references library_assets(id) on delete set null,
  add column if not exists cover_image_url text;

comment on column audios.cover_asset_id is '콘텐츠 배경이미지로 고른 라이브러리 자산';
comment on column audios.cover_image_url is '콘텐츠 배경이미지 화면용 주소(자산을 숨겨도 유지)';

-- 화면용 이미지 버킷(공개)
insert into storage.buckets (id, name, public)
values ('library-display', 'library-display', true)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- 임시 정책 — 아직 로그인이 없어서, 다른 테이블들처럼 라이브러리 등록·파일 업로드를
-- 잠시 열어둡니다(0011의 멤버 전용 정책과 함께 적용되며, 정책은 OR로 합쳐집니다).
-- ⚠️ Supabase Auth 연동 후 아래 정책들은 반드시 삭제하세요. 그러면 0011의
--    "그 채널 멤버만" 정책만 남습니다.
-- ─────────────────────────────────────────────
drop policy if exists "library_assets_wireframe_insert" on library_assets;
create policy "library_assets_wireframe_insert" on library_assets for insert with check (true);

drop policy if exists "library_assets_wireframe_update" on library_assets;
create policy "library_assets_wireframe_update" on library_assets for update using (true);

drop policy if exists "library_assets_wireframe_read" on library_assets;
create policy "library_assets_wireframe_read" on library_assets for select using (true);

drop policy if exists "channel_library_links_wireframe_all" on channel_library_links;
create policy "channel_library_links_wireframe_all" on channel_library_links for all using (true) with check (true);

drop policy if exists "library_buckets_wireframe_insert" on storage.objects;
create policy "library_buckets_wireframe_insert" on storage.objects
  for insert with check (bucket_id in ('library', 'library-display'));

-- 비공개 버킷의 서명 URL 발급에 필요한 읽기 권한(로그인 후에는 채널 멤버로 좁히거나,
-- 서버에서 service role로 서명하도록 바꿉니다).
drop policy if exists "library_bucket_wireframe_read" on storage.objects;
create policy "library_bucket_wireframe_read" on storage.objects
  for select using (bucket_id = 'library');
