"use client";

// 이전 페이지로 — 오렌지 그라데이션(위 살구빛 → 아래 오렌지) 바탕에 검은 화살표 + "이전" 글자(눈에 잘 띄게).
// 이 사이트 안에서 넘어왔으면 브라우저 '뒤로'와 같고, 주소를 바로 열어 들어왔거나 다른
// 사이트에서 왔으면 fallbackHref로 갑니다(사이트 밖으로 튕겨 나가지 않게).

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export class BackNavigation {
  static #KEY = "the-line:previous-path";

  /** 페이지가 바뀔 때마다 부릅니다(NavigationTracker) — 직전 사이트 안 주소를 기억합니다. */
  static remember(previousPath) {
    try {
      window.sessionStorage.setItem(BackNavigation.#KEY, previousPath);
    } catch {
      // 사생활 보호 모드 등 — 기억하지 못하면 fallbackHref로 갑니다.
    }
  }

  /** 이 탭에서 사이트 안의 다른 페이지를 거쳐 왔는지. */
  static cameFromThisSite() {
    if (typeof window === "undefined" || window.history.length <= 1) return false;
    try {
      if (window.sessionStorage.getItem(BackNavigation.#KEY)) return true;
      return Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
    } catch {
      return false;
    }
  }

  static go(router, fallbackHref) {
    if (BackNavigation.cameFromThisSite()) router.back();
    else router.push(fallbackHref);
  }
}

/** 루트 레이아웃에 한 번 두면, 사이트 안에서 페이지가 바뀔 때마다 직전 주소를 기억합니다. */
export function NavigationTracker() {
  const pathname = usePathname();
  const previous = useRef(null);
  useEffect(() => {
    if (previous.current && previous.current !== pathname) BackNavigation.remember(previous.current);
    previous.current = pathname;
  }, [pathname]);
  return null;
}

export default function BackButton({ fallbackHref = "/", label = "이전", className = "" }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => BackNavigation.go(router, fallbackHref)}
      className={`inline-flex items-center gap-2 rounded-full bg-linear-to-b from-[#ffc48a] to-[#f59a4a] px-4 py-2 text-sm font-semibold tracking-tight text-stone-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_4px_12px_-4px_rgb(245_154_74/0.6)] transition ${className}`}
      aria-label="이전 페이지로"
    >
      <ArrowLeft size={17} strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}
