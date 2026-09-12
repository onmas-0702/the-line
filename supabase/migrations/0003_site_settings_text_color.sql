-- 은혜의 밤 더 라인 — 홈페이지 텍스트 색상 설정
-- "제작/관리 → 디자인 적용"에서 배경 이미지 위에 올라가는 글자 색을 지정할 수
-- 있도록 site_settings에 컬럼을 추가합니다.

alter table site_settings
  add column if not exists text_color text not null default '#ffffff';
