# 은혜의 밤 더 라인 — 와이어프레임

목회자 오디오 나눔 플랫폼입니다. Next.js(App Router) + Tailwind CSS로 만들었고,
Supabase(Postgres + Storage)를 연결하면 실제 오디오 파일과 메타데이터가 저장됩니다.
아직 연결하지 않았다면 브라우저 localStorage만으로도 화면 흐름을 그대로 확인할 수 있어요.

기존에 진행 중인 `onmas` 프로젝트와는 별개의 신규 프로젝트입니다.

## 포함된 화면

- `/` — 메인 피드. 구독자들이 함께 보는 화면. 재생, 대본 다운로드, 정렬(최신/인기/제목),
  표시 개수 설정
- `/login` — Google / 카카오 로그인 버튼 (실제 인증은 미연결)
- `/record` — 실제 마이크 녹음(입력장치 선택, USB 마이크 포함) 또는 실제 파일 업로드 →
  실제 오디오 파형 기반 마그네틱 타임라인 편집(자르기, 클립 드래그 이동, 구간 삭제 → 빈 공간 →
  빈 공간 삭제 시 자석처럼 자동 이어붙이기, 실제 재생/탐색), 나눔 정보(설교자/교회/성경본문/카테고리/
  태그/설명) 입력 양식, 배경음악은 공식 라이브러리(읽기 전용) / 내 라이브러리(업로드·삭제 가능,
  실제 파일 저장) 두 곳으로 분리, 볼륨 조절, 대본 첨부

영감노트와 마이페이지는 제거되었습니다. 녹음/업로드/편집 기능은 그대로이고,
완성된 오디오는 저장 즉시 메인 피드에 나타납니다.

## 오디오 녹음/업로드/편집 — 실제 구현됨

`getUserMedia` + `MediaRecorder`(녹음), `AudioContext.decodeAudioData`(업로드 파일 디코딩),
실제 PCM 샘플을 분석한 파형, 실제 오디오 버퍼를 잘라 붙이는 자르기/삭제/자동 이어붙이기,
Web Audio로 재생하는 타임라인까지 모두 브라우저에서 직접 처리합니다 (`lib/audio.js`).
저장("믹싱하고 공유하기")을 누르면 편집된 클립들을 실제로 이어 붙여 WAV로 인코딩합니다.

## 저장 — Supabase DB + Storage 연동

`lib/supabaseClient.js` / `lib/audioStorage.js`가 실제 저장을 담당합니다.
환경변수(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)가 설정되어 있으면:

- 녹음/업로드해서 편집한 오디오가 WAV로 인코딩되어 `audio` 스토리지 버킷에 올라가고,
  제목·설교자·교회·성경본문·카테고리·태그·설명 같은 메타데이터가 `audios` 테이블에 저장됩니다.
- 대본 파일도 함께 업로드되어 홈 피드에서 바로 다운로드할 수 있습니다.
- 배경음악(내 라이브러리)도 실제 파일이 `background-music` 버킷에 저장되고 `background_tracks`
  테이블에 기록되어, 미리듣기 버튼으로 실제 소리를 들을 수 있습니다.
- 메인 피드는 로컬 목업 대신 Supabase에서 실시간으로 목록을 불러옵니다.

환경변수가 없으면 자동으로 로컬 전용 모드(localStorage + 임시 blob URL)로 동작해서,
서버 없이도 화면을 계속 확인할 수 있습니다.

### 연결 방법

1. Supabase 프로젝트를 준비합니다 (기존에 쓰던 프로젝트를 재사용해도 되고, `더 라인` 전용으로
   새로 만들어도 됩니다).
2. `supabase/migrations/0001_init.sql` 내용을 Supabase 대시보드의 SQL Editor에 붙여넣고
   실행합니다. `audios`, `background_tracks` 테이블과 `audio`, `background-music` 스토리지
   버킷이 생성됩니다.
3. `.env.example`을 `.env.local`로 복사하고, Supabase 프로젝트의 Settings → API 화면에 있는
   Project URL과 anon public key를 채워 넣습니다.
4. 개발 서버를 재시작하면 (`npm run dev`) 자동으로 실제 DB 모드로 전환됩니다.
5. Vercel에 배포한 상태라면, Vercel 프로젝트 Settings → Environment Variables에도 같은 두 값을
   추가하고 다시 배포해야 서버에서도 실제 DB가 연결됩니다.

**보안 관련 참고**: 지금 마이그레이션의 RLS(행 단위 보안) 정책은 로그인이 아직 실제로 붙어있지
않은 단계라서 "누구나 읽고 쓸 수 있게" 열어뒀습니다. Supabase Auth 로그인을 연동한 뒤에는
`created_by` / `owner_id` 기준으로 정책을 좁혀야 합니다 (마이그레이션 파일 안에 주석으로 표시해뒀어요).

## 검색을 위한 메타데이터

`/record`에서 오디오를 저장할 때 제목 외에 설교자, 교회, 성경 본문, 카테고리(새벽기도/주일설교 등,
`lib/mockData.js`의 `CATEGORY_OPTIONS`), 태그(쉼표 구분), 간단한 설명을 입력할 수 있습니다.
DB에는 이 항목들을 모두 검색 가능한 형태로 저장해뒀어요 (`audios.search_vector` — 제목/설교자/
교회/본문/카테고리/설명/태그를 합쳐 만든 전문 검색 인덱스, `tags`는 배열 인덱스, `title`은
트라이그램 인덱스). 지금은 화면에 검색창이 없지만, `lib/audioStorage.js`의 `fetchAudios({ search })`
함수가 이미 이 인덱스를 사용하도록 준비되어 있어서, 나중에 검색 UI만 추가하면 바로 연결할 수 있어요.

## 디자인 — 향후 레트로 스킨 / 이미지 스킨 적용 준비

`app/globals.css`에 색상 값을 CSS 변수(`--background`, `--accent`, `--card` 등)로
모아뒀습니다. 나중에 세피아 톤·빈티지 보더 같은 레트로 감성 스킨이나, 한 장의 삽화(예: 창밖 풍경이
보이는 라디오 책상)를 배경으로 까는 이미지 스킨을 입힐 때도, `<html data-theme="retro">`처럼
속성만 추가하고 이 변수 값들과 배경 이미지를 오버라이드하면 컴포넌트 구조를 크게 건드리지 않고
스킨을 갈아끼울 수 있도록 자리를 만들어뒀어요 (`globals.css` 안 주석 처리된 예시 참고).

## 로컬에서 확인하기

1. Node.js 18.18 이상이 설치되어 있어야 합니다 (`node -v`로 확인).
2. 이 폴더에서 의존성을 설치합니다.

   ```bash
   npm install
   ```

3. (선택) Supabase를 연결하려면 위 "연결 방법"을 따라 `.env.local`을 만듭니다.
4. 개발 서버를 실행합니다.

   ```bash
   npm run dev
   ```

5. 브라우저에서 http://localhost:3000 접속. `/record`에서 녹음을 시작하면 브라우저가
   마이크 권한을 물어봅니다 — 허용해야 실제 녹음이 됩니다.

Supabase 없이 확인 중이었다면, 개발자도구 콘솔에서
`localStorage.removeItem("eunhye-the-line-store-v2")` 후 새로고침하면 초기 목업 데이터로 리셋됩니다.

## 다음 단계 (참고)

- 배경음악 실제 믹싱(더킹 포함): 목소리 트랙과 배경음악을 `lib/audio.js`의 버퍼 합성 로직으로 함께 렌더링
- 검색 UI: `fetchAudios({ search })`를 사용하는 검색창을 홈 화면에 추가
- 로그인: Supabase Auth 연동 (Google은 기본 지원, 카카오는 커스텀 OAuth 처리 필요) 후 RLS 정책 강화
- 레트로 / 이미지 스킨: 위 디자인 토큰을 기반으로 색상/폰트/텍스처를 교체
