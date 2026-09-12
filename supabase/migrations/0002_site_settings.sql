-- 은혜의 밤 더 라인 — 사이트 디자인(배경 스킨) 설정
-- "제작/관리" 페이지의 "디자인 적용" 탭에서 업로드한 전체 배경 이미지 URL을
-- 한 행(id='default')에 저장해두고, 모든 방문자의 화면에 동일하게 적용합니다.

-- ─────────────────────────────────────────────
-- 1. 사이트 설정 테이블 (지금은 배경 스킨 이미지 하나만)
-- ─────────────────────────────────────────────
create table if not exists site_settings (
  id text primary key default 'default',
  skin_image_url text,
  updated_at timestamptz not null default now()
);

insert into site_settings (id) values ('default')
on conflict (id) do nothing;

create or replace function site_settings_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists site_settings_set_updated_at on site_settings;
create trigger site_settings_set_updated_at
  before update on site_settings
  for each row execute function site_settings_set_updated_at();

-- ─────────────────────────────────────────────
-- 2. 스토리지 버킷 — 배경 스킨 이미지 저장용
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('site-design', 'site-design', true)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- 3. RLS — 지금은 로그인이 아직 실제로 붙어있지 않은 와이어프레임 단계라
--    임시로 누구나 읽고 쓸 수 있게 열어둡니다.
--    ⚠️ Supabase Auth 연동 후에는 반드시 관리자(운영자)만 수정 가능하도록 좁혀야 합니다.
-- ─────────────────────────────────────────────
alter table site_settings enable row level security;

drop policy if exists "site_settings_public_read" on site_settings;
create policy "site_settings_public_read" on site_settings for select using (true);

drop policy if exists "site_settings_public_update" on site_settings;
create policy "site_settings_public_update" on site_settings for update using (true);

drop policy if exists "site_settings_public_insert" on site_settings;
create policy "site_settings_public_insert" on site_settings for insert with check (true);

drop policy if exists "site_design_bucket_public_insert" on storage.objects;
create policy "site_design_bucket_public_insert" on storage.objects
  for insert with check (bucket_id = 'site-design');

drop policy if exists "site_design_bucket_public_delete" on storage.objects;
create policy "site_design_bucket_public_delete" on storage.objects
  for delete using (bucket_id = 'site-design');
