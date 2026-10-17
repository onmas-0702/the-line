# 더 라인 — 멀티 채널 설계

플랫폼 **더 라인** 안에 방송 채널이 여러 개 있는 구조입니다. 지금 운영 중인
"은혜의 밤 더 라인"이 **채널 A**이고, 앞으로 유료회원이 되면 같은 구조와 기능을
가진 자기 채널 B, C, D …를 받습니다. 유튜브 채널처럼 각자 자기 스튜디오를 갖되,
녹음·편집·배경음악·디자인 기능은 모두 같은 코드를 함께 씁니다(채널마다 코드를
복사하지 않습니다 — 데이터만 채널별로 나뉩니다).

> 현재 단계: **기반 설계만 반영**. 로그인·결제·채널 개설 신청 화면은 아직 없고,
> 지금은 채널 A 하나로 기능을 다듬는 중입니다.

## 1. 회원 구조

큰 틀은 고정이고, 세부 정책(댓글 범위, 무료 체험 등)은 바뀔 수 있습니다.

| 등급 | 조건 | 관람 | 댓글 등 참여 | 채널(스튜디오) 개설 |
| --- | --- | :---: | :---: | :---: |
| 비회원 | 로그인 안 함 | ✅ | — | — |
| 회원 | 무료 가입 | ✅ | ✅ | — |
| 유료회원 | 회원 + 구독 결제 | ✅ | ✅ | ✅ (요금제 한도만큼) |

- **결제는 사람에게 붙습니다.** 유료회원 구독(`member_subscriptions`)이 활성인 동안
  채널을 열고 운영할 수 있습니다. 구독이 끝나면 그 사람이 소유한 채널은 `suspended`가 됩니다.
- **등급은 따로 저장하지 않습니다.** "로그인 여부 + 구독 상태"로 그때그때 계산해서,
  결제 상태와 등급이 어긋나는 일이 없게 합니다.
- **채널 안의 역할**은 등급과 별개입니다. 채널 소유자(owner)는 다른 회원을 편집자(editor)로
  초대할 수 있고, 편집자는 유료회원이 아니어도 그 채널의 제작/관리를 함께 할 수 있습니다.
- **권한 규칙은 `lib/access.js`의 `AccessPolicy` 한 곳**에만 둡니다. 정책이 바뀌면
  여기와 DB 정책(RLS)만 같이 고치면 됩니다.

| `AccessPolicy` | 규칙 |
| --- | --- |
| `canView` | 운영 중인 채널이면 누구나 |
| `canComment` | 회원 이상 |
| `canCreateChannel` | 유료회원 + 요금제 채널 수 한도 안 |
| `canManageChannel` | 그 채널의 owner/editor |
| `canAdministerChannel` | 그 채널의 owner |

## 2. 주소 체계

| 주소 | 화면 | 상태 |
| --- | --- | --- |
| `/` | 플랫폼 홈(소개·채널 목록·개설 신청 안내) | 지금은 `/theline`으로 이동 |
| `/{채널주소}` | 채널 홈(피드, 배경 스킨) | ✅ |
| `/{채널주소}/record` | 채널의 제작/관리 | ✅ |
| `/login`, `/signup` | 플랫폼 공용 계정 화면 | 와이어프레임 |
| `/apply` | 채널 개설 신청 + 요금제 선택 + 결제 | 예정 |
| `/admin` | 운영사(플랫폼 관리자) 화면 | 예정 |
| `/record` | 예전 주소 → `/theline/record`로 이동 | ✅ |

- **채널 주소(slug)**: 영문 소문자·숫자·하이픈, 3~30자. 한글 채널명은 화면에
  보이는 `name`으로 따로 둡니다(한글 주소는 공유할 때 `%EC%83%88...`처럼 깨져
  보여서 피했습니다).
- **예약어**: 플랫폼이 쓰는 최상위 경로(`login`, `apply`, `admin` …)는 채널
  주소로 쓸 수 없습니다. 목록은 두 곳에 똑같이 유지해야 합니다:
  `lib/channel.js`의 `ChannelSlug.RESERVED`, `0006_channels.sql`의 체크 제약.
  플랫폼 화면을 새로 추가할 때마다 두 곳에 함께 등록하세요.
- 기본 채널 주소는 `theline`이고, 환경변수 `NEXT_PUBLIC_DEFAULT_CHANNEL_SLUG`로
  바꿀 수 있습니다.

## 3. 데이터 모델

```
auth.users ──1 profiles (표시 이름)
     ├──1 member_subscriptions >── plans      ← 유료회원 여부
     ├──< channel_members >── channels        ← 채널 안의 역할(owner/editor)
     └──< comments

channels ──< audios ──< comments
    ├──< library_assets (올린 자산)  ※ 운영 채널(is_platform)의 shared 자산 = 플랫폼 공용
    ├──< channel_library_links >── library_assets   ← 공용 자산 "가져가기"(연결)
    ├──< channel_followers              ← 구독
    ├──< background_tracks              ※ library_assets로 옮길 예정
    └──1 site_settings (로고·대표이미지·소개글·기본 배경 이미지)
```

| 테이블 | 역할 |
| --- | --- |
| `channels` | 채널 하나. `slug`(주소), `name`, `owner_id`, `status`(`pending`/`active`/`suspended`), `is_platform`(운영 채널) |
| `channel_members` | 채널 운영자들. `role` = `owner` / `editor` |
| `plans` | 유료회원 요금제(가격, 한도 `limits` — 예: `{"channels": 1, "storage_mb": 5000}`) |
| `member_subscriptions` | 회원 1명당 구독 1개. 결제 상태. PG 연동 시 서버만 씀 |
| `profiles` | 회원 표시 이름·사진. 가입 시 자동 생성 (0007) |
| `comments` | 댓글. 누구나 읽기, 회원만 쓰기 (0007) |
| `audios`, `background_tracks`, `site_settings` | 기존 테이블에 `channel_id` 추가 |
| `library_assets` | 배경음악·배경이미지 등 자산. 공개 범위, 가져가기·다운로드 허용, 출처 증빙 (0011) |
| `channel_library_links` | 다른 채널이 공용 자산을 가져간 연결 (0011) |
| `channel_followers` | 채널 구독. 화면에는 숫자만 공개 (0010) |

- 스토리지 파일은 `channels/{channel_id}/…` 폴더 아래에 저장됩니다(채널 삭제·용량
  집계용). 기존 파일은 예전 경로 그대로 둡니다.
- 마이그레이션은 기존 데이터를 전부 채널 A로 옮겨 담습니다.

## 4. 코드 구조

| 위치 | 역할 |
| --- | --- |
| `lib/access.js` | `MemberTier`, `Viewer`, `AccessPolicy` — 회원 등급·권한 규칙 |
| `lib/library.js` | `AssetKind`, `AssetProvenance`(출처·공용 공개 규칙), `LibraryAsset`, `LibraryRepository` — 공용 자산 라이브러리 |
| `lib/channel.js` | `ChannelSlug`(주소 규칙·예약어), `Channel`(모델, `path()`), `ChannelRepository`, `ChannelResolver` |
| `app/[channel]/layout.js` | 서버에서 주소 → 채널 조회. 없으면 404, `active`가 아니면 "준비 중" 안내 |
| `components/ChannelProvider.js` | `useChannel()` → `{ channel, repos }`. 저장소는 전부 그 채널로 한정 |
| `lib/supabaseRepository.js` | 공통 부모. `channelId`가 있으면 `scoped()`(조회 필터), `withChannel()`(저장 시 `channel_id`), `storagePath()` 자동 적용 |
| `lib/store.js` | 채널별 화면 상태. localStorage도 채널마다 다른 키 |
| `app/(platform)/` | 채널에 속하지 않는 계정·신청·관리 화면 |

**규칙**: 채널 안의 화면에서 Supabase를 부를 때는 반드시 `useChannel().repos`를
씁니다. 저장소를 직접 `new` 하면 채널 구분이 빠집니다. 채널 안 링크는
`channel.path("record")`처럼 만듭니다(`"/record"` 하드코딩 금지).

**마이그레이션 전 호환**: `channels` 테이블이 없거나 Supabase가 설정되지 않았으면
기본 채널은 `channel.id = null`인 레거시 모드로 동작해서, 지금과 똑같이
보입니다. 그래서 코드 배포와 SQL 적용 순서가 어긋나도 사이트가 깨지지 않습니다.

## 5. 공용 자산 라이브러리

플랫폼 운영 채널('은혜의 밤, 더 라인')이 라이브러리에 올린 배경음악·배경이미지는
**플랫폼 전체의 공용 자산**이 되고, 다른 채널은 이를 자기 채널로 가져가서 씁니다.

| 항목 | 규칙 |
| --- | --- |
| 공용으로 올리기 | 운영 채널(`channels.is_platform`)의 관리자만. 채널 이름이 아니라 표시로 판단 |
| 가져가기 | 파일 복사 없이 연결(`channel_library_links`). 운영 채널이 자료를 고치면 모두에게 반영 |
| 다운로드 | 기본 금지(`allow_download = false`). 파일은 비공개 버킷 `library`에 두고, 재생·믹싱은 짧게 유효한 서명 URL로만 |
| 지우기 | 공용 자산은 지우지 않고 숨김(`status = 'hidden'`). 배경음악은 저장 시 최종 파일에 합쳐지므로 이미 만든 콘텐츠는 그대로 |
| 원본 보관 | 올린 원본 파일은 손대지 않고 보관(출처 메타데이터 유지). 믹싱은 복사본으로만 |
| 출처 증빙 | 자산마다 `source`(직접 제작/Suno/구매·라이선스), 만든 당시 요금제, 생성일·다운로드일, 라이선스 메모 |

권한은 `AccessPolicy.canPublishSharedAsset` / `canImportAsset` / `canDownloadAsset`,
공용 공개 가능 여부는 `AssetProvenance.sharingProblems()`가 판단하고, 같은 규칙을 DB 트리거
`library_assets_check_sharing`이 한 번 더 강제합니다.

**Suno로 만든 곡** (Suno 약관, 2026-09-03 시행 기준 — 법률 자문 아님, 정식 공개 전 확인 권장)
- 무료 플랜 곡은 비상업적 용도로만 가능 → 공용 라이브러리에 올릴 수 없음
- Pro/Premier 요금제로 만들고 **Suno 정식 경로로 다운로드한 곡**만 상업적 이용 가능
  → 공용으로 올릴 때 요금제·다운로드일 입력 필수
- 제3자에게 파일을 넘기거나(양도·재라이선스·판매) 접근을 주는 것은 제한 →
  **다운로드 허용 불가**, 플랫폼 안에서 가져가 쓰는 것만. 이 방식도 "접근 제공"으로 볼
  여지가 있어 공용 라이브러리 정식 오픈 전에 Suno 문의나 법률 검토 필요
- Suno가 넣은 워터마크·메타데이터 제거 금지, 다른 AI 학습에 사용 금지
- 생성 곡에 저작권이 생긴다는 보장이 없음. 여러 채널이 같은 곡을 쓰므로 유통사
  Content ID 등록은 하지 말 것(다른 채널 콘텐츠에 저작권 신고가 걸릴 수 있음)

**옮기기 계획**: 라이브러리 화면을 만들 때 기존 `background_tracks`를 `library_assets`로
옮기고(운영 채널 자료는 출처 확인 후 `shared`로 전환), 배경음악 선택 화면이
`LibraryRepository`를 쓰게 바꿉니다. 그 전까지 앱은 `background_tracks`를 그대로 씁니다.

## 6. 앞으로의 단계

1. **회원가입·로그인 (Supabase Auth)** — `/login`, `/signup` 와이어프레임을 실제로
   연결. 서버에서도 세션을 읽을 수 있게 `@supabase/ssr` 도입. 로그인한 사람의
   `Viewer`(구독 상태·채널 역할)를 만들어 화면에 나눠줍니다.
2. **댓글** — 콘텐츠 아래 댓글 목록(누구나), 작성란(`AccessPolicy.canComment`일 때만,
   아니면 "회원가입 후 댓글을 남길 수 있어요").
3. **쓰기 권한 좁히기 (RLS)** — 지금은 로그인이 없어서 누구나 쓸 수 있습니다.
   로그인 후 아래처럼 "그 채널 멤버만"으로 바꿉니다:
   ```sql
   drop policy "audios_public_insert" on audios;
   create policy "audios_member_insert" on audios
     for insert with check (is_channel_member(channel_id));
   -- update/delete, background_tracks, site_settings, storage.objects도 같은 방식
   ```
   그리고 `/{채널}/record`는 멤버만 들어올 수 있게 레이아웃에서 막습니다.
4. **유료회원 가입 + 채널 개설 (`/apply`)**
   1. 회원 로그인 → 요금제 선택 → PG 결제창(예: 토스페이먼츠 정기결제)
   2. 결제 성공 웹훅을 서버(Route Handler, service role 키)가 받아
      `member_subscriptions.status = active` → 이제 유료회원
   3. 채널 주소·이름 입력(`ChannelSlug.validate`로 즉시 확인) →
      `channels`(active) + `channel_members`(owner) 생성 (`AccessPolicy.canCreateChannel` 확인)
   4. 결제 실패·해지 → 구독 `past_due`/`canceled` → 소유 채널 `suspended`
5. **운영사 화면 (`/admin`)** — 채널 목록, 상태 변경.
6. **공용 자산 라이브러리 화면** — 운영 채널의 자산 올리기(출처 입력), 다른 채널의
   공용 라이브러리 둘러보기·가져가기, `background_tracks` 옮기기 (5장 참고).
7. **플랫폼 홈 (`/`)** — 채널 목록·소개·개설 안내 추가.
8. **요금제 한도** — `plans.limits`(채널 수, 용량, 편집자 수 등)를 개설/업로드/초대 시 검사.

## 7. 나중에 정할 것

- 요금제 종류와 가격, 무료 체험 여부
- 공용 자산(특히 Suno 곡)을 다른 채널이 쓰는 방식에 대한 Suno 측 확인·법률 검토 결과
- 구독이 끝난 채널의 콘텐츠를 계속 공개할지(관람만 허용) 완전히 숨길지
- 댓글 외에 회원 전용으로 둘 기능(좋아요, 구독/알림, 다운로드 등)
- 결제 대행사(토스페이먼츠, 포트원 등)
- 채널 개설을 결제 즉시 자동으로 할지, 운영사 승인을 거칠지
- 채널 주소 변경 허용 여부(바뀌면 기존 링크가 깨지므로 리디렉션 테이블 필요)
- 나중에 서브도메인(`saebit.the-line.com`)이나 개인 도메인 연결을 지원할지 —
  지원하더라도 `proxy`에서 도메인 → 채널 주소로 바꿔주면 지금 구조를 그대로 씁니다.
