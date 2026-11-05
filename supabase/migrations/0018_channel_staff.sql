-- 더 라인 — 공동 운영자(스태프)와 기능별 권한
--
-- 채널 소유자(owner)는 모든 기능을 쓰고, 다른 회원을 공동 운영자(editor)로 지정하면서
-- 그 사람이 쓸 수 있는 기능을 고릅니다. 기능 목록은 lib/staff.js의 StudioPermission과 같아야 합니다.
--   content   — 콘텐츠 제작(녹음·업로드, 배경음악·배경이미지 올리기)
--   manage    — 콘텐츠 관리(올린 콘텐츠 수정·삭제)
--   design    — 채널 디자인(로고·대표이미지·소개글·기본 배경)
--   community — 공지·오픈채팅
-- 운영자 지정·해제는 소유자만 합니다.
--
-- 0015, 0016 다음에 실행하세요. 0017(쓰기 권한 좁히기)을 이미 실행했다면 이 파일이 그
-- 정책들을 기능별 권한으로 바꿉니다. 아직이라면 0017 → 0018 순서로 실행하세요.
-- ⚠️ 0017처럼 이 파일도 쓰기를 운영자로 좁히므로, 실행 전에 소유자 계정을 channel_members에
--    'owner'로 등록해 두어야 합니다(docs/multi-channel-architecture.md 6장).
-- 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────
-- 1. 운영자별 기능 권한
-- ─────────────────────────────────────────────
alter table channel_members
  add column if not exists permissions text[] not null default '{}',
  add column if not exists added_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'channel_members_permissions_known') then
    alter table channel_members add constraint channel_members_permissions_known
      check (permissions <@ array['content', 'manage', 'design', 'community']::text[]);
  end if;
end $$;

-- 소유자이거나, 그 기능을 받은 운영자인지.
create or replace function has_channel_permission(target_channel uuid, permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from channel_members m
    where m.channel_id = target_channel
      and m.user_id = auth.uid()
      and (m.role = 'owner' or permission = any(m.permissions))
  );
$$;

grant execute on function has_channel_permission(uuid, text) to anon, authenticated;

-- ─────────────────────────────────────────────
-- 2. current_viewer()에 운영자별 기능 목록을 더합니다.
-- ─────────────────────────────────────────────
create or replace function current_viewer()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when auth.uid() is null then null else json_build_object(
    'user_id', auth.uid(),
    'display_name', (select p.display_name from profiles p where p.id = auth.uid()),
    'is_subscriber', is_subscriber(auth.uid()),
    'has_studio_plan', has_active_plan(auth.uid(), 'studio'),
    'subscription', (
      select json_build_object(
        'plan_code', s.plan_code,
        'status', s.status,
        'current_period_end', s.current_period_end
      )
      from member_subscriptions s
      where s.user_id = auth.uid() and s.kind = 'membership' and s.channel_id is null
      order by s.updated_at desc
      limit 1
    ),
    'owned_channel_count', (
      select count(*) from channel_members m where m.user_id = auth.uid() and m.role = 'owner'
    ),
    'channel_roles', coalesce((
      select json_object_agg(m.channel_id, m.role) from channel_members m where m.user_id = auth.uid()
    ), '{}'::json),
    'channel_permissions', coalesce((
      select json_object_agg(m.channel_id, m.permissions) from channel_members m where m.user_id = auth.uid()
    ), '{}'::json)
  ) end;
$$;

-- ─────────────────────────────────────────────
-- 3. 운영자 관리 — 소유자만 부를 수 있는 함수들. channel_members는 브라우저에서 직접
--    읽고 쓸 수 없으므로(RLS 정책 없음) 이 함수들을 통해서만 바꿉니다.
-- ─────────────────────────────────────────────

-- 채널의 운영자 목록(이메일 포함) — 소유자만.
create or replace function channel_staff_list(target_channel uuid)
returns table (user_id uuid, email text, display_name text, role text, permissions text[], created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_channel_member(target_channel, 'owner') then
    raise exception '채널 소유자만 볼 수 있어요.' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, coalesce(p.display_name, ''), m.role, m.permissions, m.created_at
    from channel_members m
    join auth.users u on u.id = m.user_id
    left join profiles p on p.id = m.user_id
    where m.channel_id = target_channel
    order by (m.role = 'owner') desc, m.created_at;
end;
$$;

-- 이메일로 회원을 찾아 운영자로 지정하거나, 이미 운영자면 기능을 바꿉니다 — 소유자만.
-- 가입한 회원만 지정할 수 있습니다(먼저 회원가입을 해야 함).
create or replace function channel_staff_upsert(target_channel uuid, member_email text, new_permissions text[])
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_user uuid;
  existing_role text;
begin
  if not is_channel_member(target_channel, 'owner') then
    raise exception '채널 소유자만 운영자를 지정할 수 있어요.' using errcode = '42501';
  end if;

  select u.id into target_user from auth.users u where lower(u.email) = lower(trim(member_email)) limit 1;
  if target_user is null then
    raise exception '이 이메일로 가입한 회원이 없어요. 먼저 회원가입을 부탁해 주세요.' using errcode = 'P0002';
  end if;

  select m.role into existing_role from channel_members m
  where m.channel_id = target_channel and m.user_id = target_user;
  if existing_role = 'owner' then
    raise exception '소유자의 권한은 바꿀 수 없어요.' using errcode = '42501';
  end if;

  insert into channel_members (channel_id, user_id, role, permissions, added_by)
  values (target_channel, target_user, 'editor', coalesce(new_permissions, '{}'), auth.uid())
  on conflict (channel_id, user_id) do update set permissions = excluded.permissions;

  return json_build_object('user_id', target_user);
end;
$$;

-- 운영자 해제 — 소유자만. 소유자 자신은 해제할 수 없습니다.
create or replace function channel_staff_remove(target_channel uuid, member_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not is_channel_member(target_channel, 'owner') then
    raise exception '채널 소유자만 운영자를 해제할 수 있어요.' using errcode = '42501';
  end if;
  delete from channel_members
  where channel_id = target_channel and user_id = member_id and role <> 'owner';
end;
$$;

revoke execute on function channel_staff_list(uuid) from anon;
revoke execute on function channel_staff_upsert(uuid, text, text[]) from anon;
revoke execute on function channel_staff_remove(uuid, uuid) from anon;
grant execute on function channel_staff_list(uuid) to authenticated;
grant execute on function channel_staff_upsert(uuid, text, text[]) to authenticated;
grant execute on function channel_staff_remove(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────
-- 4. 쓰기 정책을 기능별로 — 0017의 "채널 멤버면 누구나"를 대신합니다.
-- ─────────────────────────────────────────────

-- 콘텐츠: 올리기 = content, 수정·삭제 = manage
drop policy if exists "audios_public_insert" on audios;
drop policy if exists "audios_public_update" on audios;
drop policy if exists "audios_public_delete" on audios;
drop policy if exists "audios_member_insert" on audios;
drop policy if exists "audios_member_update" on audios;
drop policy if exists "audios_member_delete" on audios;

create policy "audios_member_insert" on audios
  for insert with check (has_channel_permission(channel_id, 'content'));
create policy "audios_member_update" on audios
  for update using (has_channel_permission(channel_id, 'manage'))
  with check (has_channel_permission(channel_id, 'manage'));
create policy "audios_member_delete" on audios
  for delete using (has_channel_permission(channel_id, 'manage'));

-- 배경음악 라이브러리: content(제작 화면에서 올리고 분류)
drop policy if exists "background_tracks_public_insert" on background_tracks;
drop policy if exists "background_tracks_public_update" on background_tracks;
drop policy if exists "background_tracks_public_delete" on background_tracks;
drop policy if exists "background_tracks_member_insert" on background_tracks;
drop policy if exists "background_tracks_member_update" on background_tracks;
drop policy if exists "background_tracks_member_delete" on background_tracks;

create policy "background_tracks_member_insert" on background_tracks
  for insert with check (channel_id is not null and has_channel_permission(channel_id, 'content'));
create policy "background_tracks_member_update" on background_tracks
  for update using (channel_id is not null and has_channel_permission(channel_id, 'content'))
  with check (channel_id is not null and has_channel_permission(channel_id, 'content'));
create policy "background_tracks_member_delete" on background_tracks
  for delete using (channel_id is not null and has_channel_permission(channel_id, 'content'));

-- 채널 디자인: design
drop policy if exists "site_settings_public_update" on site_settings;
drop policy if exists "site_settings_public_insert" on site_settings;
drop policy if exists "site_settings_member_insert" on site_settings;
drop policy if exists "site_settings_member_update" on site_settings;

create policy "site_settings_member_insert" on site_settings
  for insert with check (channel_id is not null and has_channel_permission(channel_id, 'design'));
create policy "site_settings_member_update" on site_settings
  for update using (channel_id is not null and has_channel_permission(channel_id, 'design'))
  with check (channel_id is not null and has_channel_permission(channel_id, 'design'));

-- 공지·오픈채팅: community (읽기 정책은 0016 그대로)
drop policy if exists "channel_notices_member_write" on channel_notices;
create policy "channel_notices_member_write" on channel_notices
  for all using (has_channel_permission(channel_id, 'community'))
  with check (has_channel_permission(channel_id, 'community'));

drop policy if exists "channel_community_member_write" on channel_community;
create policy "channel_community_member_write" on channel_community
  for all using (has_channel_permission(channel_id, 'community'))
  with check (has_channel_permission(channel_id, 'community'));

-- 자산 라이브러리(배경이미지 등)와 스토리지 업로드는 제작·디자인 양쪽에서 쓰므로
-- 0011/0017의 "채널 멤버" 정책을 그대로 둡니다.
