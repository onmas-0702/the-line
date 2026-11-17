"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Home, Mic } from "lucide-react";
import AccountMenu from "@/components/auth/AccountMenu";
import BottomNav from "@/components/BottomNav";
import { useChannel } from "@/components/ChannelProvider";
import { titleEn, titleKo } from "@/components/common/titleFonts";
import { useAppStore } from "@/lib/store";

// 채널 안의 메뉴 — 실제 주소는 채널마다 /{채널주소}/… 로 붙습니다. 스튜디오 메뉴는
// 누구에게나 보이고, 들어가면 스튜디오 레이아웃이 로그인·운영자 여부를 확인합니다
// (로그인 안 했으면 로그인 화면 → 로그인 뒤 스튜디오로 돌아옴).
// 콘텐츠 화면(배경이미지가 화면 전체에 깔리는 곳)에서는 "한 장의 그림" 같은 느낌을 위해
// 투명한 아이콘(말풍선 모양 칩)만 남기고, 그 외 화면은 일반 흰색 내비게이션을 씁니다.
const channelLinks = [
  { sub: "", label: "홈", icon: Home },
  { sub: "studio", label: "스튜디오", icon: Mic },
];

export default function NavBar() {
  const pathname = usePathname();
  const { channel } = useChannel();
  const links = channelLinks.map((link) => ({ ...link, href: channel.path(link.sub) }));

  const isImmersive = useIsImmersiveContent(pathname);
  if (isImmersive) {
    return <ImmersiveNav channel={channel} />;
  }
  // 채널 메인·스튜디오는 위 메뉴줄 없이, 메뉴는 아래 아이콘 줄로(메인은 대표이미지가 맨 위를 꽉 채움).
  if (channel.isHomePath(pathname) || channel.isStudioPath(pathname)) {
    return <ChannelHomeNav channel={channel} pathname={pathname} />;
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href={channel.path()} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-night-700 text-sm font-semibold text-white">
              은
            </span>
            <ChannelTitle name={channel.name} />
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
                      ? "bg-night-700 text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="ml-1">
              <AccountMenu variant="nav" />
            </div>
          </nav>

          <div className="sm:hidden">
            <AccountMenu variant="navIcon" />
          </div>
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
                  active ? "text-night-700" : "text-stone-500"
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

/** 지금 화면이 배경이미지가 깔린 콘텐츠 화면인지. */
function useIsImmersiveContent(pathname) {
  const { channel } = useChannel();
  const { audios, artwork } = useAppStore();
  if (!channel.isContentPath(pathname)) return false;
  const contentId = decodeURIComponent(pathname.split("/").pop());
  const item = audios.find((a) => a.id === contentId);
  return Boolean(item && artwork.thumbnailFor(item));
}


function ImmersiveNav({ channel }) {
  return (
    <>
      <header data-idle-hide className="sticky top-0 z-10">
        {/* 채널로 가는 "은" 버튼은 아래 홈 버튼과 겹쳐서 두지 않습니다 — 위에는 계정 버튼만. */}
        <div className="mx-auto flex max-w-3xl items-center justify-end px-4 py-3">
          <AccountMenu variant="chip" />
        </div>
      </header>

      {/* 아래 가운데에는 채널로 돌아가는 버튼 하나만 둡니다(스튜디오 마이크 버튼은 콘텐츠 화면에서 뺌).
          콘텐츠 화면에는 위쪽 채널 버튼이 없어서, 넓은 화면(웹)에서도 보여 줍니다. */}
      <nav data-bottom-nav data-idle-hide className="fixed inset-x-0 bottom-0 z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-center px-4 pb-4">
          <ChannelHomeButton channel={channel} />
        </div>
      </nav>
    </>
  );
}

/** 채널 메인·스튜디오 아래의 아이콘 줄(components/BottomNav.js). */
function ChannelHomeNav({ channel, pathname }) {
  return <BottomNav homeHref={channel.path()} studioHref={channel.studioPath()} pathname={pathname} />;
}

const HINT_MS = 3500; // 콘텐츠 화면을 연 직후 말풍선을 잠깐 보여 주는 시간

/** 콘텐츠 화면 아래 가운데의 "채널 홈" 버튼 — 채널 로고(없으면 대표이미지, 그것도 없으면 이름 첫 글자)를
 *  동그랗게 보여 주고, 위에 무슨 버튼인지 알려 주는 말풍선을 띄웁니다. 말풍선은 화면을 연 직후 잠깐
 *  나타났다 사라지고(휴대폰), 넓은 화면에서는 마우스를 올리거나 키보드로 고르면 다시 보입니다. */
function ChannelHomeButton({ channel }) {
  const { artwork } = useAppStore();
  const [isHinting, setIsHinting] = useState(true);
  const imageUrl = artwork.logoUrl || artwork.bannerUrl;
  const label = `${channel.name} 채널 홈`;

  useEffect(() => {
    const timer = setTimeout(() => setIsHinting(false), HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="group relative">
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 mb-2.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#f3d9a8]/90 px-3 py-1 text-xs font-medium text-[#17204a] shadow-[0_0_14px_rgb(255_180_100/0.35)] backdrop-blur-sm transition duration-300 group-hover:opacity-100 group-focus-within:opacity-100 ${
          isHinting ? "opacity-100" : "opacity-0"
        }`}
      >
        채널 홈
        {/* 말풍선 꼬리 */}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-[#f3d9a8]/90" />
      </span>
      <Link
        href={channel.path()}
        aria-label={label}
        className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white/15 bg-cover bg-center text-sm font-semibold text-white ring-1 ring-white/40 backdrop-blur-sm transition"
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      >
        {!imageUrl && channel.name.slice(0, 1)}
      </Link>
    </div>
  );
}

/** 상단 채널 이름 — 이름 끝의 "더 라인"은 메인 제목처럼 ", The line"(영문 이탤릭)으로 보여 줍니다. */
function ChannelTitle({ name }) {
  const SUFFIX = "더 라인";
  const head = name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length).trimEnd().replace(/,$/, "") : null;
  return (
    <span aria-label={name} className={`${titleKo.className} text-lg leading-none text-night-900 sm:text-xl`}>
      {head === null ? (
        name
      ) : (
        <>
          {head},&nbsp;<span className={`${titleEn.className} text-[1.3em]`}>The line</span>
        </>
      )}
    </span>
  );
}
