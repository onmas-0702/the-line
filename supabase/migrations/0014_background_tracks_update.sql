-- 더 라인 — 배경음악 분류(악기·분위기) 변경 허용
-- 라이브러리에서 이미 올린 곡의 분류를 바꿀 수 있도록 background_tracks에 수정 정책을
-- 추가합니다(0001에는 읽기·추가·삭제만 있었음). 분류는 lib/musicTaxonomy.js의
-- 악기(genres = [카테고리 id]) → 분위기(themes = [무드 id]) 2단계입니다.
-- ⚠️ 아직 로그인이 없어서 다른 정책들처럼 임시로 열어둡니다. Supabase Auth 연동 후에는
--    is_channel_member(channel_id)로 좁혀야 합니다.

drop policy if exists "background_tracks_public_update" on background_tracks;
create policy "background_tracks_public_update" on background_tracks for update using (true);

comment on column background_tracks.genres is
  '악기 카테고리 id(예: 01_Piano) — lib/musicTaxonomy.js MusicTaxonomy.CATEGORIES';
comment on column background_tracks.themes is
  '분위기 무드 id(예: Warm_Comfort) — 해당 카테고리의 moods 중 하나';
