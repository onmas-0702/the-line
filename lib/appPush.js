// 앱 푸시 알림(Expo) — 앱이 저장한 토큰(app_push_tokens, 0028)으로 새 콘텐츠 알림을 보냅니다.
//   AppPushToken    — 토큰 모양 확인("ExponentPushToken[...]")
//   ExpoPushSender  — Expo 푸시 서버로 100개씩 묶어 보내고, 앱을 지운 기기(DeviceNotRegistered)는 토큰을 지움
// 웹 푸시(lib/publicationNotifier.js)와 같은 발송 시점에 함께 불립니다. 서버 전용.
// EXPO_ACCESS_TOKEN(선택): Expo 계정에서 "푸시 보안"을 켜면 필요합니다.

export class AppPushToken {
  static isValid(token) {
    return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(String(token || ""));
  }
}

export class ExpoPushSender {
  static URL = "https://exp.host/--/api/v2/push/send";
  static CHUNK = 100;

  /** db: 서버 키 Supabase 클라이언트 */
  constructor(db) {
    this.db = db;
  }

  /** 구독자(또는 운영자) 기기 토큰 — 표가 아직 없으면(0028 전) 빈 목록. */
  async subscriberTokens(isAllowed) {
    const { data, error } = await this.db.from("app_push_tokens").select("token, user_id");
    if (error) return [];
    const allowed = new Map();
    for (const userId of new Set((data || []).map((r) => r.user_id))) allowed.set(userId, await isAllowed(userId));
    return (data || []).filter((r) => allowed.get(r.user_id) && AppPushToken.isValid(r.token)).map((r) => r.token);
  }

  /** message: { title, body, url } → { sent, removed } */
  async send(tokens, message) {
    let sent = 0;
    let removed = 0;
    for (let i = 0; i < tokens.length; i += ExpoPushSender.CHUNK) {
      const chunk = tokens.slice(i, i + ExpoPushSender.CHUNK);
      const tickets = await this.#post(
        chunk.map((to) => ({ to, title: message.title, body: message.body, sound: "default", data: { url: message.url } }))
      );
      for (let j = 0; j < tickets.length; j++) {
        const ticket = tickets[j];
        if (ticket?.status === "ok") sent += 1;
        else if (ticket?.details?.error === "DeviceNotRegistered") {
          await this.db.from("app_push_tokens").delete().eq("token", chunk[j]);
          removed += 1;
        }
      }
    }
    return { sent, removed };
  }

  async #post(messages) {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    try {
      const response = await fetch(ExpoPushSender.URL, { method: "POST", headers, body: JSON.stringify(messages) });
      const body = await response.json();
      return Array.isArray(body?.data) ? body.data : [];
    } catch {
      return [];
    }
  }
}
