// 기능 스위치 — 만들어 두었지만 아직 열지 않은 기능을 한곳에서 켜고 끕니다.
// 끈 기능은 화면(메뉴·버튼·안내 문구)에서만 숨기고, 코드·DB·저장된 데이터는 그대로 둡니다.
// 켜는 방법: 아래 기본값을 true로 바꾸거나, 환경변수(예: NEXT_PUBLIC_FEATURE_OPEN_CHAT=true)를
// 넣고 다시 배포하면 됩니다. 서버·클라이언트 양쪽에서 쓰므로 "use client"를 붙이지 않습니다.

export class FeatureFlags {
  static #read(value, fallback) {
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
  }

  /** 구독자 카카오톡 오픈채팅 참여(마이 페이지 "오픈채팅 참여", 스튜디오 공지 탭의 오픈채팅 설정).
   *  초기에는 운영하지 않아서 꺼 둡니다(2026-11). */
  static OPEN_CHAT = FeatureFlags.#read(process.env.NEXT_PUBLIC_FEATURE_OPEN_CHAT, false);

  /** 채널 팔로우(무료, channel_followers)와 채널 화면의 "구독자 N명". 채널이 하나뿐인 지금은
   *  유료 멤버십과 이름이 겹치기만 해서 꺼 둡니다. 채널이 여러 개 생기면 "알림받기"로 켭니다. */
  static CHANNEL_FOLLOW = FeatureFlags.#read(process.env.NEXT_PUBLIC_FEATURE_CHANNEL_FOLLOW, false);
}
