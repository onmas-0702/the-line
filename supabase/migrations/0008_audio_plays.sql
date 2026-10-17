-- 더 라인 — 청취수 집계
-- 랜딩 페이지의 "청취수가 많은 콘텐츠" 구간을 위해, 재생이 시작될 때마다 audios.plays를
-- 1씩 올립니다. 브라우저가 plays 값을 직접 덮어쓰면 동시에 듣는 사람이 많을 때 숫자가
-- 유실되므로, DB 안에서 원자적으로 올리는 함수 하나만 열어둡니다.

create or replace function increment_audio_plays(target_audio uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update audios set plays = plays + 1 where id = target_audio;
$$;

grant execute on function increment_audio_plays(uuid) to anon, authenticated;
