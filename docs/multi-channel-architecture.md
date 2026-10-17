# 더 라인 — 멀티 채널 설계

플랫폼 **더 라인** 안에 방송 채널이 여러 개 있는 구조입니다. 지금 운영 중인
"은혜의 밤 더 라인"이 **채널 A**이고, 앞으로 누군가 유료로 가입하면 같은 구조와
기능을 가진 채널 B, C, D …가 생깁니다. 유튜브 채널처럼 각자 자기 스튜디오를 갖되,
녹음·편집·배경음악·디자인 기능은 모두 같은 코드를 함께 씁니다(채널마다 코드를
복사하지 않습니다 — 데이터만 채널별로 나뉩니다).

> 현재 단계: **기반 설계만 반영**. 로그인·결제·채널 개설 신청 화면은 아직 없고,
> 지금은 채널 A 하나로 기능을 다듬는 중입니다.

## 1. 주소 체계

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

## 2. 데이터 모델

```
plans ──< channels ──< channel_members >── auth.users
             │  └──── channel_subscriptions (1:1)
             ├──< audios
             ├──< background_tracks (personal)   ※ official 트랙은 channel_id 없음 = 전 채널 공용
             └──1 site_settings (배경 스킨·글자색)
```

| 테이블 | 역할 |
| --- | --- |
| `channels` | 채널 하나. `slug`(주소), `name`, `owner_id`, `status`(`pending`/`active`/`suspended`), `plan_code` |
| `channel_members` | 채널 운영자들. `role` = `owner` / `editor` |
| `plans` | 요금제(가격, 한도 `limits` jsonb) |
| `channel_subscriptions` | 결제 상태. PG 연동 시 서버만 씀 |
| `audios`, `background_tracks`, `site_settings` | 기존 테이블에 `channel_id` 추가 |

- 스토리지 파일은 `channels/{channel_id}/…` 폴더 아래에 저장됩니다(채널 삭제·용량
  집계용). 기존 파일은 예전 경로 그대로 둡니다.
- 마이그레이션은 기존 데이터를 전부 채널 A로 옮겨 담습니다.

## 3. 코드 구조

| 위치 | 역할 |
| --- | --- |
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

## 4. 앞으로의 단계

1. **로그인 (Supabase Auth)** — `/login` 와이어프레임을 실제로 연결. 서버에서도
   세션을 읽을 수 있게 `@supabase/ssr` 도입.
2. **쓰기 권한 좁히기 (RLS)** — 지금은 로그인이 없어서 누구나 쓸 수 있습니다.
   로그인 후 아래처럼 "그 채널 멤버만"으로 바꿉니다:
   ```sql
   drop policy "audios_public_insert" on audios;
   create policy "audios_member_insert" on audios
     for insert with check (is_channel_member(channel_id));
   -- update/delete, background_tracks, site_settings, storage.objects도 같은 방식
   ```
   그리고 `/{채널}/record`는 멤버만 들어올 수 있게 레이아웃에서 막습니다.
3. **채널 개설 신청 + 결제 (`/apply`)**
   1. 로그인 → 채널 주소·이름 입력(`ChannelSlug.validate`로 즉시 확인) → 요금제 선택
   2. `channels`(status `pending`) + `channel_members`(owner) 생성
   3. PG 결제창(예: 토스페이먼츠 정기결제) → 결제 성공 웹훅을 서버(Route Handler,
      service role 키)가 받아 `channel_subscriptions.status = active`,
      `channels.status = active`로 변경
   4. 결제 실패·해지 → `suspended` → 채널 화면에 "준비 중" 안내
4. **운영사 화면 (`/admin`)** — 채널 목록, 상태 변경, 공식 배경음악 업로드.
5. **플랫폼 홈 (`/`)** — 채널 목록·소개·개설 안내.
6. **요금제 한도** — `plans.limits`(용량, 멤버 수 등)를 업로드/초대 시 검사.

## 5. 나중에 정할 것

- 요금제 종류와 가격, 무료 체험 여부
- 결제 대행사(토스페이먼츠, 포트원 등)
- 채널 개설을 결제 즉시 자동으로 할지, 운영사 승인을 거칠지
- 채널 주소 변경 허용 여부(바뀌면 기존 링크가 깨지므로 리디렉션 테이블 필요)
- 나중에 서브도메인(`saebit.the-line.com`)이나 개인 도메인 연결을 지원할지 —
  지원하더라도 `proxy`에서 도메인 → 채널 주소로 바꿔주면 지금 구조를 그대로 씁니다.
