"use client";

// iOS Safari·카카오톡 인앱 브라우저는 페이지에 터치 이벤트가 하나도 없으면 CSS :active를
// 적용하지 않습니다. 빈 touchstart 리스너를 하나 걸어 globals.css의 "터치 반전"이 동작하게 합니다.

import { useEffect } from "react";

export class TouchFeedback {
  static #noop = () => {};

  static enable() {
    document.addEventListener("touchstart", TouchFeedback.#noop, { passive: true });
    return () => document.removeEventListener("touchstart", TouchFeedback.#noop);
  }
}

export default function TouchFeedbackEnabler() {
  useEffect(() => TouchFeedback.enable(), []);
  return null;
}
