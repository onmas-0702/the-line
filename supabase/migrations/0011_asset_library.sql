-- 더 라인 — 플랫폼 공용 자산 라이브러리
--
-- 플랫폼 운영 채널('은혜의 밤, 더 라인')이 라이브러리에 올린 배경음악·배경이미지 등은
-- 플랫폼 전체의 공용 자산이 되어, 다른 채널이 자기 채널로 "가져가서" 쓸 수 있습니다.
--   · 가져가기 = 파일 복사가 아니라 연결(channel_library_links). 저장 공간을 아끼고,
--     운영 채널이 자료를 고치면 모두에게 반영됩니다.
--   · 다운로드는 기본적으로 막습니다(allow_download = false). 특히 Suno로 만든 곡은
--     약관상 제3자에게 파일을 넘기거나(양도·재라이선스) 접근을 주는 것이 제한되므로,
--     공용으로 올릴 때 다운로드를 허용할 수 없게 DB에서 막습니다.
--   · 자산마다 출처 증빙(어디서, 어떤 요금제로, 언제 만들고 받았는지)을 남깁니다.
--   · 공용 자산은 지우지 않고 숨김(status = 'hidden') 처리합니다. 배경음악은 저장할 때
--     최종 파일에 합쳐지므로, 숨겨도 이미 만든 콘텐츠는 그대로입니다.
--
-- 기존 background_tracks는 라이브러리 화면을 만들 때 이 테이블로 옮기고 정리합니다
-- (그 전까지 앱은 background_tracks를 그대로 씁니다). 0006 다음에 실행하세요.

-- ─────────────────────────────────────────────
-- 1. 플랫폼 운영 채널 표시 — 이 채널이 올린 자산만 공용으로 공개할 수 있습니다.
--    채널 이름이 아니라 이 표시로 판단하므로, 운영 채널을 바꾸거나 늘리기 쉽습니다.
-- ─────────────────────────────────────────────
alter table channels
  add column if not exists is_platform boolean not null default false;

update channels set is_platform = true where slug = 'theline';

-- ─────────────────────────────────────────────
-- 2. 자산 — 종류를 가리지 않는 라이브러리 항목
-- ─────────────────────────────────────────────
create table if not exists library_assets (
  id uuid primary key default gen_random_uuid(),
  owner_channel_id uuid not null references channels(id) on delete cascade,
  kind text not null check (kind in ('background_music', 'background_image')),
  name text not null,
  storage_path text not null,                -- 비공개 버킷 'library' 안의 경로(원본 그대로 보관)
  file_name text,                            -- 올린 원본 파일 이름(표시용)
  mime_type text,
  duration_seconds numeric,                  -- 배경음악
  width integer,                             -- 배경이미지
  height integer,
  genres text[] not null default '{}',       -- lib/mockData.js BACKGROUND_GENRES
  themes text[] not null default '{}',       -- lib/mockData.js BACKGROUND_THEMES

  -- 공개 범위: shared = 플랫폼 공용(운영 채널만), private = 올린 채널 전용
  visibility text not null default 'private' check (visibility in ('shared', 'private')),
  allow_import boolean not null default true,     -- 다른 채널이 가져가서 쓸 수 있는지
  allow_download boolean not null default false,  -- 파일 다운로드 허용(기본 금지)
  status text not null default 'active' check (status in ('active', 'hidden')),

  -- 출처 증빙
  source text not null default 'original' check (source in ('original', 'suno', 'licensed')),
  source_plan text,                          -- 예: Suno 'pro' / 'premier' (만들 당시 요금제)
  generated_at date,                         -- 만든 날
  downloaded_at date,                        -- 정식 경로로 받은 날
  license_note text,                         -- 라이선스·출처 메모(예: 구매처, 계약 번호)

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_assets_owner_idx on library_assets (owner_channel_id);
create index if not exists library_assets_shared_idx on library_assets (kind, created_at desc)
  where visibility = 'shared' and status = 'active';
create index if not exists library_assets_genres_idx on library_assets using gin (genres);
create index if not exists library_assets_themes_idx on library_assets using gin (themes);

drop trigger if exists library_assets_set_updated_at on library_assets;
create trigger library_assets_set_updated_at
  before update on library_assets
  for each row execute function set_updated_at();

-- 공용 공개 규칙을 DB에서도 강제합니다(lib/library.js의 AssetProvenance와 같은 규칙).
create or replace function library_assets_check_sharing()
returns trigger
language plpgsql
as $$
begin
  if new.visibility = 'shared' then
    if not exists (select 1 from channels c where c.id = new.owner_channel_id and c.is_platform) then
      raise exception '공용 자산은 플랫폼 운영 채널만 올릴 수 있습니다.';
    end if;
    if new.source = 'suno' then
      if coalesce(new.source_plan, '') not in ('pro', 'premier') then
        raise exception 'Suno 곡은 Pro/Premier 요금제로 만든 것만 공용으로 올릴 수 있습니다.';
      end if;
      if new.downloaded_at is null then
        raise exception 'Suno 곡은 정식 경로로 다운로드한 날짜를 입력해야 공용으로 올릴 수 있습니다.';
      end if;
      if new.allow_download then
        raise exception 'Suno 곡은 약관상 공용 자산의 파일 다운로드를 허용할 수 없습니다.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists library_assets_check_sharing on library_assets;
create trigger library_assets_check_sharing
  before insert or update on library_assets
  for each row execute function library_assets_check_sharing();

-- ─────────────────────────────────────────────
-- 3. 가져가기 — 다른 채널이 공용 자산을 자기 라이브러리에 연결
-- ─────────────────────────────────────────────
create table if not exists channel_library_links (
  channel_id uuid not null references channels(id) on delete cascade,
  asset_id uuid not null references library_assets(id) on delete cascade,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (channel_id, asset_id)
);

create index if not exists channel_library_links_asset_idx on channel_library_links (asset_id);

-- ─────────────────────────────────────────────
-- 4. 파일 보관 — 비공개 버킷. 재생·믹싱용 주소는 서버가 짧게 유효한 서명 URL로 발급합니다
--    (공개 버킷이면 주소만 알면 누구나 받을 수 있어서 "다운로드 금지"가 지켜지지 않음).
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('library', 'library', false)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- 5. RLS
--    읽기: 공용·활성 자산은 누구나 목록을 볼 수 있고, 채널 전용 자산은 그 채널 멤버만.
--    쓰기: 자산을 올린 채널의 멤버만. 가져가기 연결은 가져가는 채널의 멤버만.
-- ─────────────────────────────────────────────
alter table library_assets enable row level security;
alter table channel_library_links enable row level security;

drop policy if exists "library_assets_read" on library_assets;
create policy "library_assets_read" on library_assets for select using (
  (visibility = 'shared' and status = 'active') or is_channel_member(owner_channel_id)
);

drop policy if exists "library_assets_member_insert" on library_assets;
create policy "library_assets_member_insert" on library_assets
  for insert with check (is_channel_member(owner_channel_id));

drop policy if exists "library_assets_member_update" on library_assets;
create policy "library_assets_member_update" on library_assets
  for update using (is_channel_member(owner_channel_id));

drop policy if exists "channel_library_links_member_read" on channel_library_links;
create policy "channel_library_links_member_read" on channel_library_links
  for select using (is_channel_member(channel_id));

drop policy if exists "channel_library_links_member_insert" on channel_library_links;
create policy "channel_library_links_member_insert" on channel_library_links
  for insert with check (
    is_channel_member(channel_id)
    and exists (
      select 1 from library_assets a
      where a.id = asset_id and a.visibility = 'shared' and a.status = 'active' and a.allow_import
    )
  );

drop policy if exists "channel_library_links_member_delete" on channel_library_links;
create policy "channel_library_links_member_delete" on channel_library_links
  for delete using (is_channel_member(channel_id));
