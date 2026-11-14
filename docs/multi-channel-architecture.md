# 더 라인 — 멀티 채널 설계

플랫폼 **더 라인** 안에 방송 채널이 여러 개 있는 구조입니다. 지금 운영 중인
"은혜의 밤 더 라인"이 **채널 A**이고, 앞으로 유료회원이 되면 같은 구조와 기능을
가진 자기 채널 B, C, D …를 받습니다. 유튜브 채널처럼 각자 자기 스튜디오를 갖되,
녹음·편집·배경음악·디자인 기능은 모두 같은 코드를 함께 씁니다(채널마다 코드를
복사하지 않습니다 — 데이터만 채널별로 나뉩니다).

> 현재 단계(2026-11 결정): **운영사 채널 '은혜의 밤, 더 라인' 하나로 운영**합니다.
> 유료 구독은 플랫폼 전체 단위이고 수익은 전부 플랫폼 것입니다(정산 없음). 채널 개설
> 신청·채널운영 요금·정산은 유료회원을 충분히 모은 뒤 전문가와 구체화합니다. 코드는
> 그때 채널을 늘릴 수 있도록 멀티 채널 구조를 그대로 유지합니다.

## 1. 회원 구조

| 구분 | 조건 | 할 수 있는 것 |
| --- | --- | --- |
| 방문자 | 로그인 안 함 | 모든 콘텐츠 듣기 |
| 회원(비구독자) | 무료 가입 | + 댓글(하트)(100자), 좋아요 |
| 구독자 | 플랫폼 유료 구독(월 5천·연 5만) | + 담아두기, My Page(운영자 공지·담아두기·감상일기·오픈채팅 참여) |
| 채널운영자 | 채널 역할(owner/editor) | 그 채널의 스튜디오(녹음·편집·콘텐츠 관리·디자인·공지) |

**채널 운영자(스태프)** — 소유자(owner)는 모든 기능과 운영자 관리를 합니다. 소유자는
스튜디오 → **운영자** 탭에서 가입한 회원을 이메일로 찾아 공동 운영자(editor)로 지정하고,
맡길 기능을 고릅니다(`lib/staff.js`의 `StudioPermission`, DB `0018_channel_staff.sql`).

| 기능 | 할 수 있는 일 | 스튜디오 탭 |
| --- | --- | --- |
| 콘텐츠 제작 (`content`) | 녹음·업로드로 새 콘텐츠, 배경음악·배경이미지 올리기 | 제작 |
| 콘텐츠 관리 (`manage`) | 올린 콘텐츠 정보·배경이미지 수정, 삭제 | 콘텐츠 관리 |
| 채널 디자인 (`design`) | 로고·대표이미지·소개글·기본 배경 | 디자인 |
| 공지·오픈채팅 (`community`) | 구독자 공지, 오픈채팅 링크 | 공지 |
| (소유자 전용) | 운영자 지정·기능 변경·해제 | 운영자 |

운영자는 맡은 기능의 탭만 보고, DB도 같은 규칙(`has_channel_permission`)으로 막습니다.
운영자는 구독자 전용 기능(My Page 등)도 모두 씁니다.

- **구독은 플랫폼 전체 단위**입니다(`member_subscriptions.kind = 'membership'`,
  `channel_id = null`). 나중에 채널별 구독을 열면 `channel_id`에 채널을 넣습니다.
- **채널운영 요금제**(월 1만·연 10만, `kind = 'studio'`)는 요금제 행만 만들어 두고
  판매하지 않습니다(`is_active = false`). 채널운영자는 채널 이름에 '더 라인'을 넣고
  플랫폼 준수사항에 동의해야 합니다(개설 신청 화면을 만들 때 `ChannelName` 검사로).
- **등급은 따로 저장하지 않습니다.** "로그인 여부 + 구독 상태 + 채널 역할"을 DB 함수
  `current_viewer()`가 한 번에 돌려주고, 앱은 이걸로 `Viewer`를 만듭니다.
- **채널 운영자는 구독자 전용 기능도 씁니다**(자기 공지·커뮤니티 확인용,
  `AccessPolicy.hasSubscriberAccess`, DB의 `has_subscriber_access()`).
- **권한 규칙은 `lib/access.js` 한 곳**(`AccessPolicy`, 화면 안내용 `FeatureGate`)에만
  두고, DB 정책(RLS)도 같은 규칙으로 맞춥니다.

| `AccessPolicy` | 규칙 |
| --- | --- |
| `canView` | 운영 중인 채널이면 누구나 |
| `canComment`, `canLike` | 회원 이상 |
| `canSave`, `canWriteJournal`, `canReadNotices`, `canJoinCommunity` | 구독자(또는 채널 운영자) |
| `canOpenMyPage` | 로그인한 회원(메뉴별 권한은 `MyPageMenu`) |
| `canManageChannel`, `canPostNotice` | 그 채널의 owner/editor |
| `canAdministerChannel` | 그 채널의 owner |
| `canCreateChannel` | 채널운영 요금제 + 한도 안(다음 단계) |

## 2. 주소 체계

| 주소 | 화면 | 상태 |
| --- | --- | --- |
| `/` | 플랫폼 메인(최신·많이 들은·자주 듣는 메신저) | ✅ |
| `/{채널주소}` | 채널 홈 | ✅ |
| `/{채널주소}/content/{콘텐츠 id}` | 콘텐츠 화면(재생 + 좋아요·담아두기·감상일기·댓글) | ✅ |
| `/{채널주소}/studio` | 스튜디오 — 채널 운영자만 | ✅ |
| `/{채널주소}/record`, `/record` | 예전 주소 → 스튜디오로 이동 | ✅ |
| `/login`, `/signup`, `/auth/…`, `/logout` | 로그인·가입·비밀번호 재설정 | ✅ (이메일) |
| `/pricing` | 구독 안내·신청 | ✅ (카드 결제는 준비 중) |
| `/mypage`, `/mypage/{메뉴}` | My Page | ✅ |
| `/terms`, `/privacy` | 약관·개인정보 처리방침 | 자리만 |
| `/apply` | 채널 개설 신청 | 다음 단계 |
| `/admin` | 운영사 화면 | 다음 단계 |

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
| `app/(platform)/` | 채널에 속하지 않는 계정·구독·My Page 화면 |
| `lib/auth.js` | `AuthService`(로그인·가입·소셜·비밀번호), `SignInForm`/`SignUpForm`(입력 검사), `SafeRedirect`, `AuthPaths`, `AuthProvider` |
| `lib/supabaseClient.js` | `SupabaseConfig` — 브라우저는 쿠키 세션 클라이언트, 서버는 공개 읽기용 |
| `lib/supabaseServer.js` | `ServerSupabase`(요청별 세션 클라이언트), `ServerViewer.current()`, `PreviewAdminFlag` |
| `lib/authProxy.js`, `proxy.js` | 매 요청 로그인 세션 갱신(Next 16의 proxy = 예전 middleware) |
| `lib/pageGuard.js` | `PageGuard` — 로그인·채널 운영자 확인 후 이동 |
| `lib/engagement.js` | 댓글(`CommentDraft`/`CommentRepository`), 좋아요·담아두기(`AudioMarks`/`AudioMarkRepository`), 감상일기(`JournalDraft`/`JournalRepository`) |
| `lib/community.js` | 운영자 공지(`NoticeRepository`), 오픈채팅(`CommunityInfo`/`ChannelCommunityRepository`) |
| `lib/subscription.js` | `Plan`, `PlanRepository`, `PaymentGateway`(결제대행사 연결 틀), `SubscriptionTerms` |
| `lib/staff.js` | `StudioPermission`(운영자 기능), `StaffMember`, `StaffInvite`, `ChannelStaffRepository`, `StudioTab`(탭별 필요 기능) |
| `lib/myPage.js` | `MyPageMenu`(메뉴 등록), `SavedAudioQuery`, `JournalQuery`(검색) |

**규칙**: 채널 안의 화면에서 Supabase를 부를 때는 반드시 `useChannel().repos`를
씁니다. 저장소를 직접 `new` 하면 채널 구분이 빠집니다. 채널 안 링크는
`channel.path("…")`, 스튜디오는 `channel.studioPath(tab)`으로 만듭니다(주소 하드코딩 금지).

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

### 콘텐츠 배경이미지 (0012)

콘텐츠마다 배경이미지(카드 표지·재생 바 이미지)를 지정합니다. 제작 화면과 콘텐츠 관리 탭에서
새로 올리거나 라이브러리(내 것·가져온 공용 자산)에서 고릅니다.

- 새로 올린 이미지는 `library_assets`(`background_image`)에 자동 보관 — 원본은 비공개 버킷
  `library`에 그대로, 화면용 정사각형 버전은 공개 버킷 `library-display`에
- 콘텐츠(`audios`)에는 자산 id와 화면용 주소를 함께 저장 → 라이브러리에서 숨겨도 콘텐츠에는 유지
- **이미지 순서** (`ChannelArtwork`)

  | 자리 | 순서 |
  | --- | --- |
  | 콘텐츠 카드 표지·재생 바 | 콘텐츠 배경이미지 → 채널 기본 배경 이미지 → 색 그라데이션 |
  | 채널 로고 | 로고 → 기본 배경 이미지 → 채널 이름 첫 글자 |
  | 채널 대표이미지(배너) | 대표이미지 → 기본 배경 이미지 → 색 그라데이션 |

  채널 로고는 로고 자리에만 쓰고 콘텐츠 카드에는 쓰지 않습니다.

## 6. 진행 상황과 운영 준비

### 완료 (2026-11)

1. **회원가입·로그인** — 이메일+비밀번호, 이메일 인증, 비밀번호 재설정. Google·카카오는
   Supabase에서 켠 뒤 `NEXT_PUBLIC_AUTH_PROVIDERS=google,kakao`를 넣으면 버튼이 보입니다.
   스튜디오(`/{채널}/studio`)는 채널 운영자만 들어갈 수 있습니다.
2. **댓글(하트)**, 좋아요·담아두기·감상일기 버튼(콘텐츠 화면).
3. **쓰기 권한 좁히기(RLS)** — `0017_member_write_policies.sql`.
4. **유료 구독 틀** — 요금제, 구독 안내 화면, 결제 전 고지. 실제 카드 결제는
   `PaymentGateway`의 하위 클래스(예: 토스페이먼츠 정기결제)를 사업자등록·PG 계약 후 추가합니다.
5. **My Page** — 운영자 공지, 담아두기(검색), 감상일기(메시지와 짝, 검색), 오픈채팅 참여.
   운영자는 스튜디오 → 공지 탭에서 공지와 오픈채팅 링크를 관리합니다.
6. **이미지 갤러리** (`0019_image_gallery.sql`, `lib/gallery.js`) — 플랫폼 메인 하단.
   - 운영 채널 스튜디오 → **갤러리** 탭(콘텐츠 제작 권한)에서 올림. 브라우저가 원본에서
     크게 보기용(긴 변 1600px)·썸네일(1:1)·모바일 배경이미지(1170×2532, JPG)를 만들고 원본은 그대로 보관.
   - 누구나 썸네일·크게 보기(`/gallery`, `/gallery/{id}`, 탑 메뉴는 메인과 같음).
   - 구독자만 **원본 다운로드 / 모바일 배경이미지** 받기와 **마이 갤러리** 담기(마이 페이지 → 갤러리).
     원본·배경이미지는 비공개 버킷 `gallery` — 구독자에게만 5분짜리 서명 URL(`AccessPolicy.canUseGallery`,
     DB 정책 `gallery_bucket_subscriber_read`). 휴대폰은 공유 창(사진에 저장), 앱 안 브라우저는 이미지를 열어 길게 눌러 저장.
7. **콘텐츠 다시 편집** (`0020_audio_edit_project.sql`, `lib/audioProject.js`) — 스튜디오 → 콘텐츠 관리에서
   제작 화면과 같은 오디오 작업대(`components/studio/AudioWorkbench.js`)로 자르기·트리밍·볼륨·배경음악 바꾸기.
   저장할 때 완성본과 함께 "목소리만"(`voice_url`)과 배경음악 설정(`edit_settings`)을 남겨서, 다시 열면 목소리
   위에 배경음악을 새로 섞습니다. 0020 전에 저장한 콘텐츠는 배경음악이 섞인 완성본을 클립으로 불러옵니다.

8. **예약 공개·구독자 알림** (`0021_scheduled_publish_notifications.sql`, `lib/publishing.js`, `lib/notifications.js`,
   `lib/publicationNotifier.js`, `app/api/notifications/dispatch/route.js`, `public/sw.js`)
   - 스튜디오 제작 화면 "공개 시점": 바로 공개 / 예약 공개(날짜·시각). 콘텐츠 관리에서 예약 시각을 옮기거나 지금 공개.
   - 공개 여부는 DB 읽기 정책(`publish_at <= now()`, 운영자는 예약 중인 것도 봄)이 정하므로 정확히 그 시각에 보입니다.
   - 앱 안 알림: 상단 종 모양 배지 + 마이 페이지 → 알림. "공개 시각 > 마지막으로 본 시각"으로 계산(별도 발송 없음).
   - 휴대폰 푸시: 마이 페이지 → 알림 → [알림 켜기](구독자만). 공개 시각이 지나면 `/api/notifications/dispatch`가
     콘텐츠마다 한 번 발송(`audios.notified_at`). 아이폰은 iOS 16.4+에서 홈 화면에 추가한 앱으로 열었을 때만 받습니다.
   - 발송을 깨우는 것: ① 사이트 방문 때 브라우저가 3분에 한 번 조용히 호출(`DispatchTrigger`) ② 권장 — 예약 작업.
     Vercel 무료 요금제의 크론은 하루 1번뿐이라, Supabase에서 5분마다 부르게 합니다(SQL Editor):
     ```sql
     create extension if not exists pg_cron;
     create extension if not exists pg_net;
     select cron.schedule('the-line-push-dispatch', '*/5 * * * *', $$
       select net.http_post(url := 'https://<배포 주소>/api/notifications/dispatch',
                            headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);
     $$);
     ```
   - 환경변수(.env.local과 Vercel 모두): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`(만들어 둠),
     `VAPID_SUBJECT`(예: `mailto:연락처 이메일`), `SUPABASE_SERVICE_ROLE_KEY`(Supabase → Project Settings → API의
     service_role 키, 서버 전용). 하나라도 없으면 푸시만 건너뛰고 예약 공개·앱 안 알림은 그대로 동작합니다.

### Supabase에 적용하는 순서

1. SQL Editor에서 `0015_auth_viewer.sql`, `0016_engagement_mypage.sql` 실행
2. Authentication → URL Configuration
   - Site URL: 배포 주소(예: `https://the-line-….vercel.app`)
   - Redirect URLs: `http://localhost:3000/**`, `https://<배포 주소>/**`
3. 운영자 계정으로 `/signup`에서 가입(이메일 인증까지)
4. 그 계정을 기본 채널의 소유자로 등록:
   ```sql
   insert into channel_members (channel_id, user_id, role)
   select c.id, u.id, 'owner'
   from channels c, auth.users u
   where c.slug = 'theline' and u.email = '운영자@이메일'
   on conflict (channel_id, user_id) do update set role = 'owner';
   ```
5. 운영자 계정으로 스튜디오 저장이 되는지 확인한 뒤 `0017_member_write_policies.sql`,
   이어서 `0018_channel_staff.sql` 실행(기능별 권한·운영자 지정), 이미지 갤러리는 `0019_image_gallery.sql`,
   콘텐츠 다시 편집은 `0020_audio_edit_project.sql`, 예약 공개·알림은 `0021_scheduled_publish_notifications.sql`
6. 콘텐츠 제작자 등 함께 운영할 분은 먼저 회원가입 → 소유자가 스튜디오 → 운영자 탭에서
   그분의 이메일로 지정하고 맡길 기능을 고르기
7. (결제 연동 전) 구독자를 직접 지급할 때:
   ```sql
   insert into member_subscriptions (user_id, plan_code, kind, status, provider, current_period_end, note)
   select id, 'membership_monthly', 'membership', 'active', 'manual', now() + interval '1 month', '운영자 지급'
   from auth.users where email = '구독자@이메일'
   on conflict (user_id, kind, channel_id) do update
     set status = 'active', current_period_end = excluded.current_period_end;
   ```

### 임시 결제: KG이니시스 결제 링크

정기결제(빌링) 정식 연동 전까지, 멤버십 가입 화면의 결제 버튼이 KG이니시스 상점관리자에서 만든
**결제 링크**를 새 창으로 엽니다(`InicisLinkPaymentGateway`, `lib/subscription.js`).

1. 이니시스 상점관리자에서 월간(5,000원)·연간(50,000원) 결제 링크를 만든다
2. Vercel 환경변수에 넣고 다시 배포:
   ```
   NEXT_PUBLIC_PAYMENT_PROVIDER=inicis-link
   NEXT_PUBLIC_INICIS_LINK_MEMBERSHIP_MONTHLY=https://…
   NEXT_PUBLIC_INICIS_LINK_MEMBERSHIP_YEARLY=https://…
   ```
3. 결제 내역(구매자 이메일)을 확인하고 위 7번 SQL로 그 계정에 멤버십 지급
   (`provider`는 'inicis-link', 기간은 월간 1개월·연간 1년)

1회 결제라 자동 갱신이 아니며, 결제 전 안내 문구도 그에 맞춰 바뀝니다. 이 값을 지우면 다시
"결제 준비 중"으로 돌아갑니다.

### 다음 단계

- **카드 정기결제 연동** — 사업자등록·통신판매업 신고·PG 계약 후. 결제 완료 웹훅(Route
  Handler, service role 키)이 `member_subscriptions`를 갱신. 약관·환불정책 법률 검토.
- **My Page 해지 버튼** — 결제 연동과 함께(`cancel_at_period_end`).
- **무료 '구독'(channel_followers)을 '팔로우'로 이름 정리** — 유료 구독과 헷갈리지 않게.
- **채널 개설 신청(`/apply`)·채널운영 요금·정산** — 유료회원 확보 후.
- **운영사 화면(`/admin`)**, **요금제 한도 검사**.

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
