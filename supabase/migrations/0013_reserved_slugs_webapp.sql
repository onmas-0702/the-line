-- 더 라인 — 웹앱(홈 화면 추가) 주소를 채널 주소 예약어에 추가
-- app/icon.js(/icon/192, /icon/512), app/apple-icon.js(/apple-icon),
-- app/manifest.js(/manifest.webmanifest)가 최상위 경로를 쓰므로, 같은 이름의 채널 주소를
-- 만들 수 없게 합니다. lib/channel.js의 ChannelSlug.RESERVED와 같은 목록입니다.

alter table channels drop constraint if exists channels_slug_not_reserved;
alter table channels add constraint channels_slug_not_reserved check (slug <> all (array[
  'about', 'admin', 'api', 'apple-icon', 'apply', 'auth', 'billing', 'channels', 'favicon.ico',
  'help', 'icon', 'login', 'logout', 'manifest.webmanifest', 'mypage', 'notes', 'pricing',
  'privacy', 'record', 'settings', 'signup', 'studio', 'support', 'terms'
]));
