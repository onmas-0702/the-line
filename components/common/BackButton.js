"use client";

// 이전 페이지로 — 가는 선 화살표 + "이전" 글자의 테두리 버튼(메인 화면 버튼과 같은 결).
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
      className={`inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-transparent px-3 py-1.5 text-[13px] font-medium tracking-tight text-stone-600 transition hover:border-stone-400 hover:text-stone-900 ${className}`}
      aria-label="이전 페이지로"
    >
      <ArrowLeft size={15} strokeWidth={1.5} aria-hidden />
      {label}
    </button>
  );
}
