// 회원 탈퇴 — 마이 페이지 > 계정에서 본인이 직접 탈퇴합니다.
//   AccountDeletion — 확인 조건(확인 글자 + 동의), 서버에서 DB 함수(delete_my_account, 0025) 부르기,
//                     오류를 한국어 안내로 바꾸기, 브라우저에서 탈퇴 요청 보내기.
// 서버(app/api/account/delete/route.js)와 브라우저(components/mypage/AccountSection.js)가 함께 씁니다.

export class AccountDeletion {
  static CONFIRM_WORD = "탈퇴";
  static ENDPOINT = "/api/account/delete";

  static Code = Object.freeze({
    NOT_SIGNED_IN: "not_signed_in",
    CHANNEL_OWNER: "channel_owner",
    ACTIVE_SUBSCRIPTION: "active_subscription",
    NOT_READY: "not_ready", // DB에 0025를 아직 실행하지 않음
    FAILED: "failed",
  });

  static #MESSAGES = Object.freeze({
    not_signed_in: "로그인이 풀렸어요. 다시 로그인한 뒤 탈퇴해 주세요.",
    channel_owner: "채널 소유자는 바로 탈퇴할 수 없어요. 채널을 다른 분께 넘기거나 정리해야 하니 운영팀에 문의해 주세요.",
    active_subscription: "이용 중인 멤버십이 있어요. 멤버십을 해지한 뒤 탈퇴해 주세요.",
    not_ready: "탈퇴 기능을 준비하고 있어요. 잠시 뒤 다시 시도하거나 운영팀에 문의해 주세요.",
    failed: "탈퇴하지 못했어요. 잠시 뒤 다시 시도하거나 운영팀에 문의해 주세요.",
  });

  /** 탈퇴하면 지워지는 것(화면 안내용). */
  static REMOVED = Object.freeze([
    "로그인 계정과 프로필(이름·이메일)",
    "남긴 댓글, 좋아요·담아두기, 감상일기",
    "갤러리에 담아둔 이미지 목록과 알림 설정",
  ]);

  /** 확인 글자를 정확히 쓰고 안내에 동의했을 때만 탈퇴 버튼이 켜집니다. */
  static canSubmit(typed, agreed) {
    return Boolean(agreed) && String(typed || "").trim() === AccountDeletion.CONFIRM_WORD;
  }

  static messageFor(code) {
    return AccountDeletion.#MESSAGES[code] || AccountDeletion.#MESSAGES.failed;
  }

  /** DB 오류 → 코드. 함수가 없으면(0025 미실행) NOT_READY. */
  static codeFrom(error) {
    const text = `${error?.message || ""} ${error?.code || ""}`;
    const known = [AccountDeletion.Code.NOT_SIGNED_IN, AccountDeletion.Code.CHANNEL_OWNER, AccountDeletion.Code.ACTIVE_SUBSCRIPTION];
    const hit = known.find((code) => text.includes(code));
    if (hit) return hit;
    if (error?.code === "PGRST202" || /delete_my_account/.test(text)) return AccountDeletion.Code.NOT_READY;
    return AccountDeletion.Code.FAILED;
  }

  /** 서버: 로그인한 사람의 세션으로 DB 함수를 부릅니다. → { ok: true } | { ok: false, code } */
  static async run(client) {
    if (!client) return { ok: false, code: AccountDeletion.Code.NOT_READY };
    const { data } = await client.auth.getUser();
    if (!data?.user) return { ok: false, code: AccountDeletion.Code.NOT_SIGNED_IN };
    const { error } = await client.rpc("delete_my_account");
    if (error) return { ok: false, code: AccountDeletion.codeFrom(error) };
    // 계정이 지워졌으니 남은 로그인 쿠키도 비웁니다(실패해도 계정은 이미 없음).
    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      // 무시
    }
    return { ok: true };
  }

  /** 브라우저: 탈퇴 요청. → { ok: true } | { ok: false, message } */
  static async request() {
    try {
      const response = await fetch(AccountDeletion.ENDPOINT, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok) return { ok: true };
      return { ok: false, message: AccountDeletion.messageFor(body.code) };
    } catch {
      return { ok: false, message: AccountDeletion.messageFor(AccountDeletion.Code.FAILED) };
    }
  }
}
