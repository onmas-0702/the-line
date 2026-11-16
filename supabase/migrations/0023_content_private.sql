-- 더 라인 — 콘텐츠 비공개
--
-- audios.is_private: 운영자가 "비공개"로 돌린 콘텐츠. 비공개면 공개 시각이 지났어도 채널 운영자만 볼 수 있고,
-- 다시 "공개"나 "예약 공개"로 돌리면 정책에 따라 다시 보입니다(콘텐츠 관리 화면).
-- 비공개 콘텐츠는 휴대폰 알림·앱 안 알림에서도 빠집니다(lib/publicationNotifier.js, lib/notifications.js).
--
-- 0021(예약 공개) 다음에 실행하세요. 여러 번 실행해도 안전합니다.

alter table audios add column if not exists is_private boolean not null default false;

-- 보기: 공개 시각이 지났고 비공개가 아닌 콘텐츠는 누구나, 나머지(예약 중·비공개)는 그 채널 운영자만.
drop policy if exists "audios_public_read" on audios;
create policy "audios_public_read" on audios
  for select using ((publish_at <= now() and not is_private) or is_channel_member(channel_id));
