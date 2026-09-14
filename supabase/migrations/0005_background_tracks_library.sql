-- 은혜의 밤 더 라인 — 배경음악 라이브러리 구조 정리
--
-- 지금까지는 "공식 라이브러리"가 코드(lib/mockData.js)에 고정된 샘플 목록일
-- 뿐이라 실제 DB와는 무관했고, background_tracks 테이블에 들어있는 행은
-- 전부 다 "내 라이브러리"로 취급됐습니다(누가 올렸든 구분 없이 전부 한
-- 보관함). 여러 창작자가 함께 쓰는 걸 감안해서, 이제 하나의 테이블 안에서
-- 두 종류를 명확히 구분합니다:
--
--   · library_type = 'official' → 공식 라이브러리. 모든 창작자가 함께 접근
--     할 수 있는 공용 보관함입니다(owner_id는 항상 null). 실제로는 아직
--     관리자 업로드 화면이 없어서 비어있지만, 나중에 그 화면에서 올리는
--     트랙은 전부 이 타입으로 들어갑니다.
--   · library_type = 'personal' (기본값) → 내 라이브러리. 해당 창작자만의
--     공간입니다. 로그인 연동 전까지는 owner_id가 null인 채로 사실상 하나의
--     공용 보관함처럼 동작하지만(지금은 사용자가 한 명뿐이라 문제 없음),
--     Supabase Auth가 붙으면 새로 올리는 행부터 owner_id = auth.uid()를
--     채우고, 기존 행들은 실제 소유자로 한 번 수동 백필해줘야 합니다.
--
-- 함께, 테마별·장르별 분류를 위한 배열 컬럼도 추가합니다(자유 태그가 아니라
-- lib/mockData.js의 BACKGROUND_GENRES / BACKGROUND_THEMES 고정 목록 중에서
-- 고르는 방식 — 이유는 이 파일 하단 주석 참고).

alter table background_tracks
  add column if not exists library_type text not null default 'personal'
    check (library_type in ('official', 'personal')),
  add column if not exists genres text[] not null default '{}',
  add column if not exists themes text[] not null default '{}';

comment on column background_tracks.library_type is
  '''official'' = 모든 창작자가 접근 가능한 공용 라이브러리, ''personal'' = 업로드한 창작자만의 라이브러리';
comment on column background_tracks.owner_id is
  'personal 트랙의 소유자. official 트랙은 항상 null. 로그인 연동 전까지는 personal 트랙도 null(단일 사용자 단계라 임시로 공용처럼 동작).';
comment on column background_tracks.genres is
  '사운드 성격 태그(예: 피아노, 어쿠스틱 기타, 오케스트라 등) — lib/mockData.js의 BACKGROUND_GENRES 참고';
comment on column background_tracks.themes is
  '용도·분위기 태그(예: 새벽·묵상, 위로·포근함 등) — lib/mockData.js의 BACKGROUND_THEMES 참고';

create index if not exists background_tracks_library_type_idx on background_tracks (library_type);
create index if not exists background_tracks_owner_id_idx on background_tracks (owner_id);
create index if not exists background_tracks_genres_idx on background_tracks using gin (genres);
create index if not exists background_tracks_themes_idx on background_tracks using gin (themes);

-- ─────────────────────────────────────────────
-- RLS는 지금 당장 바꿀 필요가 없습니다 — 0001_init.sql에서 이미
-- background_tracks 전체를 public read/insert/delete로 열어뒀고, 로그인이
-- 없는 지금 단계에서는 그게 맞습니다. Supabase Auth가 실제로 붙으면 아래
-- 방향으로 정책을 좁혀주세요:
--
--   · select: library_type = 'official' 이거나 owner_id = auth.uid() 인
--     행만 보이게 (다른 창작자의 개인 라이브러리는 보이지 않아야 함)
--   · insert: personal 트랙은 owner_id = auth.uid()로 강제, official
--     트랙은 관리자 role만 허용
--   · update/delete: personal 트랙은 owner_id = auth.uid() 인 본인 것만,
--     official 트랙은 관리자만
-- ─────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- 장르/테마를 자유 태그가 아니라 고정 목록(lib/mockData.js)에서 고르게 한
-- 이유: (1) 배경음악은 사용자가 직접 만드는 콘텐츠가 아니라 "고르는" 대상이라
-- 필터/분류가 일관돼야 쓸모가 있고, (2) 자유 입력을 허용하면 "피아노" /
-- "피아노음악" / "Piano"처럼 표기가 갈라져서 필터링이 무의미해지기 쉽습니다.
-- 목록은 코드에서 관리하다가, 관리자가 직접 추가/편집해야 할 정도로
-- 커지면 그때 별도 테이블(background_genres/background_themes)로 옮기고
-- 이 text[] 컬럼은 그 테이블을 참조하는 다대다 관계로 바꾸면 됩니다 — 지금
-- 규모에서는 그렇게 할 필요가 없어서 더 단순한 배열 컬럼 + GIN 인덱스로
-- 시작합니다(예: 필터 쿼리는 `where genres && array['피아노']` 형태).
-- ─────────────────────────────────────────────
