"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Mic, LogIn, UserPlus } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import { useAppStore } from "@/lib/store";

// 채널 안의 메뉴 — 실제 주소는 채널마다 /{채널주소}/… 로 붙습니다.
const channelLinks = [
  { sub: "", label: "홈", icon: Home },
  { sub: "record", label: "제작/관리", icon: Mic },
];

export default function NavBar() {
  const pathname = usePathname();
  const { skinImageUrl, textColor } = useAppStore();
  const { channel } = useChannel();
  const links = channelLinks.map((link) => ({ ...link, href: channel.path(link.sub) }));
  // 홈 화면에 배경 스킨이 적용되어 있을 때만 "한 장의 그림" 같은 느낌을 위해
  // 상단/하단 내비게이션을 투명한 아이콘(말풍선 모양 칩)만 남기고, 그 외
  // 페이지는 원래의 일반 흰색 내비게이션을 그대로 씁니다.
  const minimalHome = pathname === channel.path() && Boolean(skinImageUrl);
  const iconColor = textColor || "#ffffff";

  if (minimalHome) {
    return (
      <>
        <header className="sticky top-0 z-10">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link
              href={channel.path()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm font-semibold backdrop-blur-sm"
              style={{ color: iconColor }}
              aria-label={channel.name}
            >
              은
            </Link>
            <div className="flex items-center gap-1.5">
              <Link
                href="/login"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition hover:bg-white/25"
                style={{ color: iconColor }}
                aria-label="로그인"
              >
                <LogIn size={16} />
              </Link>
              <Link
                href="/signup"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition hover:bg-white/25"
                style={{ color: iconColor }}
                aria-label="회원가입"
              >
                <UserPlus size={16} />
              </Link>
            </div>
          </div>
        </header>

        <nav className="fixed inset-x-0 bottom-0 z-10 sm:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-3 px-4 pb-4">
            {links.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition"
                  style={{
                    color: iconColor,
                    backgroundColor: active ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)",
                  }}
                  aria-label={link.label}
                >
                  <Icon size={18} strokeWidth={active ? 2.4 : 2} />
                </Link>
              );
            })}
          </div>
        </nav>
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href={channel.path()} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-700 text-sm font-semibold text-white">
              은
            </span>
            <span className="text-sm font-semibold text-stone-800 sm:text-base">
              {channel.name}
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex sm:gap-2">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-amber-700 text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/login"
              className={`ml-1 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                pathname === "/login"
                  ? "border-amber-700 text-amber-700"
                  : "border-stone-300 text-stone-500 hover:bg-stone-100"
              }`}
            >
              로그인
            </Link>
          </nav>

          <Link
            href="/login"
            className={`flex h-9 w-9 items-center justify-center rounded-full border sm:hidden ${
              pathname === "/login"
                ? "border-amber-700 text-amber-700"
                : "border-stone-300 text-stone-500"
            }`}
            aria-label="로그인"
          >
            <LogIn size={16} />
          </Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2 py-1.5">
          {links.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium transition ${
                  active ? "text-amber-700" : "text-stone-500"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
