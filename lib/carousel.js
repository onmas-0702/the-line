// 옆으로 넘기는 슬라이드 줄(메인 배너) — 한 장이 줄의 폭을 꽉 채우는 스크롤 상자를 다룹니다.
// 컴포넌트는 상태만 들고, 스크롤 위치 읽기·옮기기는 여기서 합니다.

export class SlideTrack {
  static AUTO_ADVANCE_MS = 5000;

  /** 지금 보이는 슬라이드 번호. */
  static indexOf(el) {
    if (!el?.clientWidth) return 0;
    return Math.round(el.scrollLeft / el.clientWidth);
  }

  static scrollTo(el, index) {
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: SlideTrack.prefersReducedMotion() ? "auto" : "smooth" });
  }

  /** 스크롤할 때마다 보이는 번호를 알려 줍니다(같은 번호면 React가 다시 그리지 않음). 정리 함수를 돌려줍니다. */
  static onIndexChange(el, callback) {
    if (!el) return undefined;
    const handle = () => callback(SlideTrack.indexOf(el));
    el.addEventListener("scroll", handle, { passive: true });
    return () => el.removeEventListener("scroll", handle);
  }

  /** 마지막 다음은 처음으로. */
  static next(index, count) {
    return count > 0 ? (index + 1) % count : 0;
  }

  static prefersReducedMotion() {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }
}
