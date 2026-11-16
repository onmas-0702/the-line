"use client";

// 아래 아이콘 줄 — 홈 · 스튜디오 · 마이 페이지 · 나가기(플랫폼 메인으로). 넓은 화면에서도 보입니다.
// 채널 메인·스튜디오(components/NavBar.js)와 마이 페이지(플랫폼 레이아웃)가 함께 씁니다.

import Link from "next/link";
import { DoorOpen, Home, Mic, UserRound } from "lucide-react";
import { MyPageMenu } from "@/lib/myPage";

export default function BottomNav({ homeHref, studioHref, pathname }) {
  const within = (base) => pathname === base || pathname.startsWith(`${base}/`);
  const items = [
    { href: homeHref, label: "홈", icon: Home, active: pathname.replace(/\/+$/, "") === homeHref },
    { href: studioHref, label: "스튜디오", icon: Mic, active: within(studioHref) },
    { href: MyPageMenu.BASE_PATH, label: "마이페이지", icon: UserRound, active: within(MyPageMenu.BASE_PATH) },
    { href: "/", label: "나가기", icon: DoorOpen, active: false },
  ];
  return (
    <nav data-bottom-nav className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2 py-1.5">
        {items.map(({ href, label, icon: Icon, active }) => (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium transition ${
              active ? "text-night-700" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 2} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
