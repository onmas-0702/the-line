// 한 번만 보여주는 안내 — 닫으면(또는 안내를 따라가면) 이 브라우저에서는 다시 보여주지 않습니다.
// 브라우저 저장소(localStorage)를 못 쓰는 환경(사생활 보호 모드 등)에서는 이번 방문 동안만 닫힙니다.

export class OneTimeNotice {
  constructor(key) {
    this.key = `the-line:notice:${key}`;
    Object.freeze(this);
  }

  /** 회원마다 따로 기억하는 안내(같은 기기에서 다른 계정으로 로그인해도 다시 보이게). */
  static forUser(name, userId) {
    return new OneTimeNotice(`${name}:${userId || "guest"}`);
  }

  get isDismissed() {
    try {
      return window.localStorage.getItem(this.key) === "1";
    } catch (e) {
      return false;
    }
  }

  dismiss() {
    try {
      window.localStorage.setItem(this.key, "1");
    } catch (e) {
      // 저장 불가 — 이번 방문 동안만 닫힙니다.
    }
  }
}
