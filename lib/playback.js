"use client";

// 콘텐츠 화면의 재생 보조 — 진행바 위치 계산, 화면을 한동안 안 만지면 글자를 숨기는 "감상 모드", 공유하기.
//   SeekBar     — 재생 위치 ↔ 진행바 비율, 누른 곳 → 재생 위치
//   IdleScreen  — 일정 시간 손대지 않으면 <html data-idle>을 붙이고, 만지면 바로 뗍니다(숨길 요소는 data-idle-hide)
//   ContentShare — 휴대폰 공유창(navigator.share) → 안 되면 주소 복사

export class SeekBar {
  /** 0~1 진행 비율. */
  static fraction(elapsed, duration) {
    if (!duration || !Number.isFinite(duration)) return 0;
    return Math.min(1, Math.max(0, elapsed / duration));
  }

  /** 진행바의 clientX 위치 → 재생 위치(초). */
  static secondsAt(clientX, rect, duration) {
    if (!rect.width || !duration) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }
}

export class IdleScreen {
  static ATTRIBUTE = "idle";
  static DEFAULT_TIMEOUT_MS = 4000;
  static #EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];

  #timer = null;
  #timeoutMs;
  #wake = () => this.#reset();

  constructor({ timeoutMs = IdleScreen.DEFAULT_TIMEOUT_MS } = {}) {
    this.#timeoutMs = timeoutMs;
  }

  start() {
    if (typeof window === "undefined") return;
    for (const type of IdleScreen.#EVENTS) window.addEventListener(type, this.#wake, { passive: true });
    this.#reset();
  }

  stop() {
    if (typeof window === "undefined") return;
    for (const type of IdleScreen.#EVENTS) window.removeEventListener(type, this.#wake);
    clearTimeout(this.#timer);
    IdleScreen.#set(false);
  }

  #reset() {
    IdleScreen.#set(false);
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => IdleScreen.#set(true), this.#timeoutMs);
  }

  static #set(idle) {
    const root = document.documentElement;
    if (idle) root.dataset[IdleScreen.ATTRIBUTE] = "";
    else delete root.dataset[IdleScreen.ATTRIBUTE];
  }
}

export class ContentShare {
  /** @returns {"shared"|"copied"|"cancelled"|"failed"} */
  static async share({ title, url }) {
    if (typeof navigator === "undefined") return "failed";
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return "shared";
      } catch (err) {
        if (err?.name === "AbortError") return "cancelled";
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }
}
