-- 은혜의 밤 더 라인 — audios 삭제 허용
-- 0001_init.sql에는 audios의 select/insert/update 정책만 있고 delete가
-- 빠져 있어서, "제작/관리 → 콘텐츠 관리"에서 삭제를 누르면 실패합니다.
-- ⚠️ 로그인 연동 후에는 created_by = auth.uid() 조건으로 좁혀야 합니다.

drop policy if exists "audios_public_delete" on audios;
create policy "audios_public_delete" on audios for delete using (true);
