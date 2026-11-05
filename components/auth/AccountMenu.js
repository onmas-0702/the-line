"use client";

// 화면 오른쪽 위의 계정 버튼들. 로그인 안 했으면 로그인·회원가입, 했으면 My Page·로그아웃.
// variant: "landing"(플랫폼 메인) | "nav"(채널 상단 메뉴) | "navIcon"(모바일 상단 아이콘)
//          | "chip"(콘텐츠 화면의 투명 아이콘)

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, LogOut, UserPlus, UserRound } from "lucide-react";
import { useViewer } from "@/components/ViewerProvider";
import { MemberTier } from "@/lib/access";
import { AuthPaths } from "@/lib/auth";
import { MyPageMenu } from "@/lib/myPage";

const STYLES = {
  landing: {
    wrap: "flex justify-end gap-2",
    outline: "rounded-full border border-stone-300 bg-white px-4 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100",
    solid: "rounded-full bg-amber-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800",
  },
  nav: {
    wrap: "flex items-center gap-1.5",
    outline: "rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-500 transition hover:bg-stone-100",
    solid: "rounded-full bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800",
  },
  navIcon: {
    wrap: "flex items-center gap-1.5",
    outline: "flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 text-stone-500",
    solid: "flex h-9 w-9 items-center justify-center rounded-full bg-amber-700 text-white",
  },
  chip: {
    wrap: "flex items-center gap-1.5",
    outline: "flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25",
    solid: "flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25",
  },
};

export default function AccountMenu({ variant = "nav" }) {
  const viewer = useViewer();
  const pathname = usePathname();
  const style = STYLES[variant];
  const iconOnly = variant === "chip" || variant === "navIcon";

  if (!viewer.isSignedIn) {
    return (
      <div className={style.wrap}>
        <Link href={AuthPaths.login(pathname)} className={style.outline} aria-label="로그인">
          {iconOnly ? <LogIn size={16} /> : "로그인"}
        </Link>
        <Link href={AuthPaths.signup(pathname)} className={style.solid} aria-label="회원가입">
          {iconOnly ? <UserPlus size={16} /> : "회원가입"}
        </Link>
      </div>
    );
  }

  const name = viewer.displayName || "회원";
  return (
    <div className={style.wrap}>
      <Link href={MyPageMenu.BASE_PATH} className={style.solid} aria-label="My Page" title={`${name} · ${MemberTier.label(viewer.tier)}`}>
        {iconOnly ? <UserRound size={16} /> : `My Page`}
      </Link>
      <form action={AuthPaths.LOGOUT} method="post">
        <button type="submit" className={style.outline} aria-label="로그아웃">
          {iconOnly ? <LogOut size={16} /> : "로그아웃"}
        </button>
      </form>
    </div>
  );
}
