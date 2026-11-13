"use client";

// 플랫폼 메인의 상단(밤하늘 그림 + "은혜의 밤 The line" + 계정 버튼 줄). 메인과 이미지 갤러리가
// 같은 탑 메뉴를 쓰도록 따로 뺐습니다. homeLink: 제목을 눌러 메인(/)으로 돌아가게(갤러리 등).

import Image from "next/image";
import Link from "next/link";
import { Radio } from "lucide-react";
import AccountMenu from "@/components/auth/AccountMenu";
import { titleEn, titleKo } from "@/components/common/titleFonts";
import { ChannelSlug } from "@/lib/channel";
import { PLATFORM_TITLE } from "@/lib/mockData";

export default function LandingHeader({ homeLink = false }) {
  const title = (
    <>
      은혜의 밤&nbsp;<span className={`${titleEn.className} text-[45px]`}>The line</span>
    </>
  );
  const titleClass = `${titleKo.className} flex flex-1 items-center justify-center text-center text-[29px] leading-none text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.5)]`;

  return (
    // 상단 밤하늘 — 그림 아래쪽 마을이 로그인 버튼 높이에서 시작하도록 그림을 아래 기준으로 맞춤.
    // 버튼 영역은 어두운 그림 위라서 --surface를 밤색으로 바꿔 둡니다(눌렀을 때 반전 색).
    <header className="relative isolate flex h-[180px] flex-col justify-end overflow-hidden px-4 pb-4 [--surface:#0b1530] sm:h-[204px] sm:pb-6">
      <Image
        src="/hero-night-village.webp"
        alt=""
        fill
        priority
        sizes="(min-width: 768px) 768px, 100vw"
        className="-z-10 object-cover object-bottom"
      />
      {homeLink ? (
        <Link href="/" aria-label={`${PLATFORM_TITLE} 메인으로`} className={titleClass}>
          {title}
        </Link>
      ) : (
        <h1 aria-label={PLATFORM_TITLE} className={titleClass}>
          {title}
        </h1>
      )}
      <AccountMenu variant="landing" leading={[{ href: `/${ChannelSlug.DEFAULT}`, label: "마이 채널", icon: Radio }]} />
    </header>
  );
}
