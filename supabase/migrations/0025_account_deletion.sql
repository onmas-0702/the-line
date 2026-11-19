-- 더 라인 — 회원 탈퇴
--
-- 마이 페이지 > 계정 > 회원 탈퇴에서 본인이 직접 탈퇴합니다(앱스토어·구글 플레이 심사 필수 항목).
-- 탈퇴하면 로그인 계정(auth.users)이 지워지고, 그 사람에게 딸린 기록이 함께 지워집니다:
--   프로필, 댓글, 좋아요·담아두기, 감상일기, 갤러리 담기, 알림 읽음·휴대폰 알림 등록, 운영진 지정, 구독 기록.
-- 채널에 올라간 콘텐츠·이미지처럼 채널의 것은 남기고 "만든 사람"만 비웁니다(아래 1번).
--
-- 막는 경우:
--   · 채널 소유자(channel_members.role = 'owner') — 채널을 넘기거나 정리한 뒤 탈퇴(운영팀 문의).
--   · 결제 중인 구독(active·trialing·past_due) — 구독을 해지한 뒤 탈퇴.
--
-- 0024 다음에 실행하세요. 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────
-- 1. "만든 사람"처럼 auth.users를 가리키지만 삭제 규칙이 없던 칸 → 탈퇴하면 비우기(set null)
--    (audios.created_by, background_tracks.owner_id, channels.owner_id, library_assets.created_by,
--     channel_library.added_by, gallery_images.created_by, audio_drafts.created_by, landing_banners.created_by 등)
--    규칙이 없으면 이 칸들이 탈퇴를 막습니다. 목록을 직접 적지 않고 찾아서 바꾸므로 나중에 생긴 칸도 함께 처리됩니다.
-- ─────────────────────────────────────────────
do $$
declare
  fk record;
begin
  for fk in
    select c.conname, rel.relname as table_name, att.attname as column_name
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and ns.nspname = 'public'
      and array_length(c.conkey, 1) = 1
      and c.confdeltype in ('a', 'r') -- no action / restrict
      and not att.attnotnull
  loop
    execute format(
      'alter table public.%I drop constraint %I, add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      fk.table_name, fk.conname, fk.conname, fk.column_name
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────
-- 2. 본인 탈퇴 — 로그인한 사람이 자기 계정만 지웁니다.
--    오류 메시지(not_signed_in / channel_owner / active_subscription)는 lib/account.js가 한국어로 바꿔 보여 줍니다.
-- ─────────────────────────────────────────────
create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;

  if exists (select 1 from channel_members where user_id = uid and role = 'owner') then
    raise exception 'channel_owner';
  end if;

  if exists (
    select 1 from member_subscriptions
    where user_id = uid and status in ('active', 'trialing', 'past_due')
  ) then
    raise exception 'active_subscription';
  end if;

  -- 이 사람이 올린 파일의 "올린 사람" 표시를 비웁니다(파일 자체는 채널의 것이라 남김).
  -- 스토리지 표를 직접 고칠 수 없는 환경이면 건너뜁니다.
  begin
    update storage.objects set owner = null, owner_id = null where owner = uid or owner_id = uid::text;
  exception when others then
    null;
  end;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
