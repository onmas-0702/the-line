-- 더 라인 — 콘텐츠 다시 편집하기
--
-- 스튜디오 "콘텐츠 관리"에서 저장한 콘텐츠를 제작 화면과 똑같이 다시 편집(자르기·트리밍·볼륨·
-- 배경음악 바꾸기)할 수 있도록, 완성본(audio_url) 외에
--   · voice_url      — 배경음악을 섞기 전 "목소리만" 파일(audio 버킷의 audios/{id}/voice-….wav)
--   · edit_settings  — 배경음악 곡 id·배경음악 볼륨·인트로 길이({backgroundTrackId, musicVolume, voiceOffsetSeconds})
-- 를 함께 저장합니다(lib/audioProject.js의 AudioEditSettings).
--
-- 이 파일을 실행하기 전에도 앱은 동작합니다 — 그때는 완성본만 저장되고, 다시 편집할 때 배경음악이
-- 섞인 완성본을 클립으로 불러옵니다. 여러 번 실행해도 안전합니다.

alter table audios add column if not exists voice_url text;
alter table audios add column if not exists edit_settings jsonb;
