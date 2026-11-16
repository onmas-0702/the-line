"use client";

// 플랫폼 공용 화면의 메뉴 — 마이 페이지·멤버십 가입은 스튜디오처럼 위 메뉴줄 없이 아래 아이콘 줄(BottomNav),
// 나머지(로그인·구독 안내 등)는 위쪽 로고 + 계정 버튼 줄.

import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountMenu from "@/components/auth/AccountMenu";
import BottomNav from "@/components/BottomNav";
import { Channel, ChannelSlug } from "@/lib/channel";
import { MyPageMenu } from "@/lib/myPage";
import { SubscriptionPaths } from "@/lib/subscription";
import { PLATFORM_NAME } from "@/lib/mockData";

/** 위 메뉴줄 대신 아래 아이콘 줄을 쓰는 화면. */
const BOTTOM_NAV_PATHS = [MyPageMenu.BASE_PATH, SubscriptionPaths.PRICING];

export default function PlatformChrome() {
  const pathname = usePathname();
  const home = `/${ChannelSlug.DEFAULT}`;

  if (BOTTOM_NAV_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`))) {
    return <BottomNav homeHref={home} studioHref={`${home}/${Channel.STUDIO}`} pathname={pathname} />;
  }

  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href={home} className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-night-700 text-sm font-semibold text-white">
            은
          </span>
          <span className="text-sm font-semibold text-stone-800 sm:text-base">{PLATFORM_NAME}</span>
        </Link>
        <AccountMenu variant="navIcon" />
      </div>
    </header>
  );
}
