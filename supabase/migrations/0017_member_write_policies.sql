-- 더 라인 — 쓰기 권한을 "그 채널의 운영자(channel_members)"로 좁힙니다.
--
-- 로그인이 없던 와이어프레임 단계에서는 누구나 콘텐츠·배경음악·디자인을 올리고 지울 수
-- 있었습니다(0001, 0002, 0004, 0012, 0014의 임시 정책). 이 마이그레이션은 그 임시 정책을
-- 모두 지우고, 읽기는 그대로 공개, 쓰기는 그 채널의 멤버만 가능하게 바꿉니다.
--
-- ⚠️ 실행 순서가 중요합니다 — 이 파일을 실행하기 전에 반드시:
--   1) 0015, 0016을 실행하고
--   2) 운영자 계정으로 회원가입한 뒤
--   3) 그 계정을 기본 채널의 소유자로 등록하세요(docs/multi-channel-architecture.md 6장의 SQL).
--   그렇지 않으면 아무도 스튜디오에서 저장할 수 없게 됩니다.
-- 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────
-- 0. 스토리지 경로 → 채널. 모든 업로드는 channels/{채널 id}/… 아래에 저장됩니다
--    (SupabaseRepository.storagePath). 형식이 다르면 null.
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
-- 1. 콘텐츠(audios) — 읽기 공개, 쓰기는 채널 멤버
-- ─────────────────────────────────────────────
drop policy if exists "audios_public_insert" on audios;
drop policy if exists "audios_public_update" on audios;
drop policy if exists "audios_public_delete" on audios;

drop policy if exists "audios_member_insert" on audios;
create policy "audios_member_insert" on audios for insert with check (is_channel_member(channel_id));

drop policy if exists "audios_member_update" on audios;
create policy "audios_member_update" on audios
  for update using (is_channel_member(channel_id)) with check (is_channel_member(channel_id));

drop policy if exists "audios_member_delete" on audios;
create policy "audios_member_delete" on audios for delete using (is_channel_member(channel_id));

-- ─────────────────────────────────────────────
-- 2. 배경음악(background_tracks) — 채널 라이브러리는 그 채널 멤버만 쓰기.
--    공식(official, channel_id null) 트랙은 브라우저에서 쓰지 않습니다.
-- ─────────────────────────────────────────────
drop policy if exists "background_tracks_public_insert" on background_tracks;
drop policy if exists "background_tracks_public_update" on background_tracks;
drop policy if exists "background_tracks_public_delete" on background_tracks;

drop policy if exists "background_tracks_member_insert" on background_tracks;
create policy "background_tracks_member_insert" on background_tracks
  for insert with check (channel_id is not null and is_channel_member(channel_id));

drop policy if exists "background_tracks_member_update" on background_tracks;
create policy "background_tracks_member_update" on background_tracks
  for update using (channel_id is not null and is_channel_member(channel_id))
  with check (channel_id is not null and is_channel_member(channel_id));

drop policy if exists "background_tracks_member_delete" on background_tracks;
create policy "background_tracks_member_delete" on background_tracks
  for delete using (channel_id is not null and is_channel_member(channel_id));

-- ─────────────────────────────────────────────
-- 3. 채널 디자인(site_settings) — 채널당 한 행, 그 채널 멤버만 쓰기
-- ─────────────────────────────────────────────
drop policy if exists "site_settings_public_update" on site_settings;
drop policy if exists "site_settings_public_insert" on site_settings;

drop policy if exists "site_settings_member_insert" on site_settings;
create policy "site_settings_member_insert" on site_settings
  for insert with check (channel_id is not null and is_channel_member(channel_id));

drop policy if exists "site_settings_member_update" on site_settings;
create policy "site_settings_member_update" on site_settings
  for update using (channel_id is not null and is_channel_member(channel_id))
  with check (channel_id is not null and is_channel_member(channel_id));

-- ─────────────────────────────────────────────
-- 4. 자산 라이브러리 — 0012의 임시 정책을 지우면 0011의 "채널 멤버만" 정책만 남습니다.
-- ─────────────────────────────────────────────
drop policy if exists "library_assets_wireframe_insert" on library_assets;
drop policy if exists "library_assets_wireframe_update" on library_assets;
drop policy if exists "library_assets_wireframe_read" on library_assets;
drop policy if exists "channel_library_links_wireframe_all" on channel_library_links;

-- ─────────────────────────────────────────────
-- 5. 스토리지 — 업로드·삭제는 경로의 채널 멤버만. 공개 버킷(audio, background-music,
--    site-design, library-display)의 읽기는 버킷 설정으로 계속 공개입니다.
-- ─────────────────────────────────────────────
drop policy if exists "audio_bucket_public_insert" on storage.objects;
drop policy if exists "audio_bucket_public_delete" on storage.objects;
drop policy if exists "site_design_bucket_public_insert" on storage.objects;
drop policy if exists "site_design_bucket_public_delete" on storage.objects;
drop policy if exists "library_buckets_wireframe_insert" on storage.objects;
drop policy if exists "library_bucket_wireframe_read" on storage.objects;

drop policy if exists "channel_buckets_member_insert" on storage.objects;
create policy "channel_buckets_member_insert" on storage.objects
  for insert with check (
    bucket_id in ('audio', 'background-music', 'site-design', 'library', 'library-display')
    and is_channel_member(storage_channel_id(name))
  );

drop policy if exists "channel_buckets_member_update" on storage.objects;
create policy "channel_buckets_member_update" on storage.objects
  for update using (
    bucket_id in ('audio', 'background-music', 'site-design', 'library', 'library-display')
    and is_channel_member(storage_channel_id(name))
  );

drop policy if exists "channel_buckets_member_delete" on storage.objects;
create policy "channel_buckets_member_delete" on storage.objects
  for delete using (
    bucket_id in ('audio', 'background-music', 'site-design', 'library', 'library-display')
    and is_channel_member(storage_channel_id(name))
  );

-- 비공개 'library' 버킷의 원본 — 서명 URL을 만들 수 있는 사람: 그 채널 멤버.
drop policy if exists "library_bucket_member_read" on storage.objects;
create policy "library_bucket_member_read" on storage.objects
  for select using (bucket_id = 'library' and is_channel_member(storage_channel_id(name)));
