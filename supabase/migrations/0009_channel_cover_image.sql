-- 더 라인 — 채널 대문이미지
-- 스튜디오 "디자인" 탭에서 올리는 정사각형(1:1) 로고·타이틀 이미지. 랜딩 페이지의
-- 채널 로고로 쓰입니다. (처음엔 콘텐츠 카드 표지로도 썼지만, 0012부터 카드 표지는 콘텐츠별
-- 배경이미지 → 기본 배경 이미지 순이고 로고는 로고 자리에만 씁니다.)
-- 브라우저에서 800×800px로 잘라서 올리므로 DB에는 URL만 저장합니다.
-- 0006 적용 전/후 어느 쪽이든 실행할 수 있습니다.

alter table site_settings
  add column if not exists cover_image_url text;

comment on column site_settings.cover_image_url is
  '채널 대문이미지(정사각형 1:1, 800x800). 랜딩 카드 표지에 사용';
