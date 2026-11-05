"use client";

// 마이 페이지의 틀 — 위쪽 메뉴(가로로 넘기는 탭)와 본문. 메뉴는 MyPageMenu.SECTIONS를 그대로 그립니다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Lock, Megaphone, MessageCircle, NotebookPen, UserRound } from "lucide-react";
import BackButton from "@/components/common/BackButton";
import { useViewer } from "@/components/ViewerProvider";
import { MemberTier } from "@/lib/access";
import { MyPageMenu } from "@/lib/myPage";

// 섹션 key → 아이콘. 새 섹션을 추가하면 여기에도 아이콘을 하나 넣어주세요(없으면 기본 아이콘).
const ICONS = { notices: Megaphone, saved: Bookmark, journal: NotebookPen, community: MessageCircle };

export default function MyPageShell({ children }) {
  const viewer = useViewer();
  const pathname = usePathname();
  const tabs = [
    { key: "home", label: "내 정보", path: MyPageMenu.BASE_PATH, icon: UserRound, locked: false },
    ...MyPageMenu.SECTIONS.map((section) => ({
      key: section.key,
      label: section.labelFor(viewer),
      path: section.path,
      icon: ICONS[section.key] || UserRound,
      locked: !section.gateFor(viewer).allowed,
    })),
  ];

  return (
    <div className="space-y-5">
      <BackButton fallbackHref="/" />
      <div>
        <h1 className="text-lg font-semibold text-stone-900">{MyPageMenu.TITLE}</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          {viewer.displayName}님 · {viewer.isChannelStaff ? "채널 운영자" : MemberTier.label(viewer.tier)}
        </p>
      </div>
      <nav className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5">
          {tabs.map(({ key, label, path, icon: Icon, locked }) => {
            const active = pathname === path;
            return (
              <Link
                key={key}
                href={path}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  active ? "bg-amber-700 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                }`}
              >
                <Icon size={14} /> {label}
                {locked && <Lock size={11} className={active ? "text-white/80" : "text-stone-400"} />}
              </Link>
            );
          })}
        </div>
      </nav>
      <div>{children}</div>
    </div>
  );
}
