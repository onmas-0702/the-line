"use client";

// 화면 오른쪽 위의 계정 버튼들. 로그인 안 했으면 로그인·회원가입, 했으면 마이 페이지·로그아웃.
// variant: "landing"(플랫폼 메인) | "nav"(채널 상단 메뉴) | "navIcon"(모바일 상단 아이콘)
//          | "chip"(콘텐츠 화면의 투명 아이콘)

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, LogOut, Sparkles, UserPlus, UserRound } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import { useViewer } from "@/components/ViewerProvider";
import { MemberTier } from "@/lib/access";
import { AuthPaths } from "@/lib/auth";
import { MyPageMenu } from "@/lib/myPage";
import { MembershipOffer } from "@/lib/subscription";

// 누르거나 마우스를 올리면 사이트 공통 "촛불 반전"(globals.css)으로 은은하게 밝아집니다.
const LANDING_BUTTON =
  "inline-flex items-center gap-1.5 rounded-full border border-white/50 bg-black/25 px-3.5 py-1.5 text-[13px] font-medium tracking-tight text-white backdrop-blur-sm transition duration-300";

const STYLES = {
  // 플랫폼 메인 — 가는 선 아이콘 + 글자, 모두 같은 색의 테두리 버튼
  landing: {
    wrap: "flex flex-wrap justify-center gap-2",
    outline: LANDING_BUTTON,
    solid: LANDING_BUTTON,
  },
  nav: {
    wrap: "flex items-center gap-1.5",
    outline: "rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-500 transition hover:bg-stone-100",
    solid: "rounded-full bg-night-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-night-800",
  },
  navIcon: {
    wrap: "flex items-center gap-1.5",
    outline: "flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 text-stone-500",
    solid: "flex h-9 w-9 items-center justify-center rounded-full bg-night-700 text-white",
  },
  chip: {
    wrap: "flex items-center gap-1.5",
    outline: "flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25",
    solid: "flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25",
  },
};

/** 가는 선 아이콘 + 글자(메인 화면용). */
function LineLabel({ icon: Icon, children }) {
  return (
    <>
      <Icon size={15} strokeWidth={1.5} aria-hidden />
      {children}
    </>
  );
}

/** leading: 로그인한 회원에게만 계정 버튼 앞에 보여 줄 링크들 [{ href, label, icon }] — 예: 메인 화면의 마이 채널
 *  membership: 아직 구독자가 아닌 사람에게 "멤버십" 버튼을 함께 보여줄지(메인 화면)
 *  bell: 알림 종을 함께 보여줄지(메인 화면 이미지 위에서는 뺌) */
export default function AccountMenu({ variant = "nav", leading = [], membership = false, bell = true }) {
  const viewer = useViewer();
  const pathname = usePathname();
  const style = STYLES[variant];
  const iconOnly = variant === "chip" || variant === "navIcon";
  const withIcons = variant === "landing";
  const label = (icon, text) => (iconOnly ? <IconOf icon={icon} /> : withIcons ? <LineLabel icon={icon}>{text}</LineLabel> : text);
  const leadingLinks = leading.map((link) => (
    <Link key={link.href} href={link.href} className={style.outline} aria-label={link.label}>
      {label(link.icon, link.label)}
    </Link>
  ));
  const membershipLink =
    membership && MembershipOffer.shouldOffer(viewer) ? (
      <Link href={MembershipOffer.PATH} className={style.outline} aria-label={MembershipOffer.JOIN_LABEL}>
        {label(Sparkles, MembershipOffer.LABEL)}
      </Link>
    ) : null;

  if (!viewer.isSignedIn) {
    return (
      <div className={style.wrap}>
        <Link href={AuthPaths.login(pathname)} className={style.outline} aria-label="로그인">
          {label(LogIn, "로그인")}
        </Link>
        <Link href={AuthPaths.signup(pathname)} className={style.solid} aria-label="회원가입">
          {label(UserPlus, "회원가입")}
        </Link>
        {membershipLink}
      </div>
    );
  }

  const name = viewer.displayName || "회원";
  return (
    <div className={style.wrap}>
      {leadingLinks}
      {membershipLink}
      {bell && <NotificationBell className={style.outline} iconOnly={iconOnly} withLabel={withIcons} />}
      <Link href={MyPageMenu.BASE_PATH} className={style.solid} aria-label={MyPageMenu.TITLE} title={`${name} · ${MemberTier.label(viewer.tier)}`}>
        {label(UserRound, MyPageMenu.TITLE)}
      </Link>
      <form action={AuthPaths.LOGOUT} method="post">
        <button type="submit" className={style.outline} aria-label="로그아웃">
          {label(LogOut, "로그아웃")}
        </button>
      </form>
    </div>
  );
}

function IconOf({ icon: Icon }) {
  return <Icon size={16} />;
}
