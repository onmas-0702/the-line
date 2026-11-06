# 인증 메일 템플릿 (한국어)

Supabase가 보내는 인증 메일은 코드가 아니라 **Supabase 대시보드**에서 바꿉니다.
이 폴더의 파일을 그대로 붙여 넣으면 됩니다.

Supabase → **Authentication → Email Templates**

| 템플릿 | 제목(Subject)에 넣을 문구 | 본문(Message body)에 붙여 넣을 파일 |
| --- | --- | --- |
| Confirm signup | `[은혜의 밤 The line] 회원가입을 마무리해 주세요` | `confirm-signup.html` |
| Reset Password | `[은혜의 밤 The line] 비밀번호 재설정 안내` | `reset-password.html` |
| Change Email Address | `[은혜의 밤 The line] 이메일 주소 변경 확인` | `change-email.html` |

- 본문에는 파일 내용 전체(맨 위 `<!-- … -->` 안내 주석 포함)를 붙여 넣어도 됩니다.
- `{{ .ConfirmationURL }}`, `{{ .Email }}` 같은 부분은 Supabase가 채우니 지우지 마세요.

## 보내는 사람 이름도 바꾸려면 (권장)

기본 설정에서는 보내는 사람이 `Supabase Auth <noreply@mail.app.supabase.io>`로 보여서
스팸처럼 보일 수 있고, 한 시간에 보낼 수 있는 메일 수도 아주 적습니다(테스트용).
정식 운영 전에는 **Project Settings → Authentication → SMTP Settings**에서 직접 메일 서버를
연결하세요. 연결하면 다음을 정할 수 있습니다.

- Sender name: `은혜의 밤 The line`
- Sender email: 우리 도메인 주소(예: `noreply@도메인`) — 도메인이 있어야 하고, 메일 발송
  서비스(Resend, Amazon SES 등)에서 도메인 인증(SPF·DKIM)을 하면 스팸함에 덜 들어갑니다.
