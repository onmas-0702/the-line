"use client";

// 채널 배경 이미지 스킨 — 채널 홈 화면(/{채널주소})에서만 보입니다. "제작/관리" 등 다른
// 페이지는 일반적인 흰색 배경을 그대로 유지합니다(콘텐츠 제작 중에는 배경
// 이미지가 방해되지 않도록).
import { usePathname } from "next/navigation";
import { useChannel } from "@/components/ChannelProvider";
import { useAppStore } from "@/lib/store";

export default function SiteBackground() {
  const pathname = usePathname();
  const { skinImageUrl } = useAppStore();
  const { channel } = useChannel();

  if (pathname !== channel.path() || !skinImageUrl) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 bg-stone-200 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${skinImageUrl})` }}
    />
  );
}
