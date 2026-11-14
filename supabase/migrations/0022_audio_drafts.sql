-- 더 라인 — 콘텐츠 제작 "작업 저장하기"(임시 저장)
--
-- 업로드(공개)와 별개로, 편집하던 상태를 그대로 저장했다가 나중에 불러와 이어서 작업합니다.
--   · audio_drafts.data(jsonb): 클립마다 원본·자른 위치·숨긴 부분·볼륨, 빈 공간, 배경음악(곡·볼륨·인트로·
--     배경음악 클립 시작/끝), 제목·태그·설명, 공개 시점 — lib/audioDraft.js의 AudioDraftSnapshot
--   · 'drafts' 버킷(비공개): 클립의 원본 오디오(녹음·올린 파일 그대로). 이미 서버에 있는 오디오는 주소만 남깁니다.
-- 그 채널의 "콘텐츠 제작" 권한이 있는 운영자끼리 함께 보고 이어서 작업할 수 있습니다.
--
-- 0018(has_channel_permission), 0019(storage_channel_id) 다음에 실행하세요. 여러 번 실행해도 안전합니다.

create table if not exists audio_drafts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  title text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audio_drafts_channel_idx on audio_drafts (channel_id, updated_at desc);

drop trigger if exists audio_drafts_set_updated_at on audio_drafts;
create trigger audio_drafts_set_updated_at
  before update on audio_drafts
  for each row execute function set_updated_at();

alter table audio_drafts enable row level security;

drop policy if exists "audio_drafts_staff_all" on audio_drafts;
create policy "audio_drafts_staff_all" on audio_drafts
  for all using (has_channel_permission(channel_id, 'content'))
  with check (has_channel_permission(channel_id, 'content'));

-- 원본 오디오 보관(비공개) — 경로 channels/{채널 id}/drafts/{작업 id}/…
insert into storage.buckets (id, name, public) values ('drafts', 'drafts', false)
on conflict (id) do nothing;

drop policy if exists "drafts_bucket_staff_select" on storage.objects;
create policy "drafts_bucket_staff_select" on storage.objects
  for select using (bucket_id = 'drafts' and has_channel_permission(storage_channel_id(name), 'content'));

drop policy if exists "drafts_bucket_staff_insert" on storage.objects;
create policy "drafts_bucket_staff_insert" on storage.objects
  for insert with check (bucket_id = 'drafts' and has_channel_permission(storage_channel_id(name), 'content'));

drop policy if exists "drafts_bucket_staff_update" on storage.objects;
create policy "drafts_bucket_staff_update" on storage.objects
  for update using (bucket_id = 'drafts' and has_channel_permission(storage_channel_id(name), 'content'));

drop policy if exists "drafts_bucket_staff_delete" on storage.objects;
create policy "drafts_bucket_staff_delete" on storage.objects
  for delete using (bucket_id = 'drafts' and has_channel_permission(storage_channel_id(name), 'content'));
