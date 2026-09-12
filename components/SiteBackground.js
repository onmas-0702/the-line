"use client";

// 전체 배경 이미지 스킨 — 홈 화면("/")에서만 보입니다. "제작/관리" 등 다른
// 페이지는 일반적인 흰색 배경을 그대로 유지합니다(콘텐츠 제작 중에는 배경
// 이미지가 방해되지 않도록).
import { usePathname } from "next/navigation";
import { useAppStore } from "@/lib/store";

export default function SiteBackground() {
  const pathname = usePathname();
  const { skinImageUrl } = useAppStore();

  if (pathname !== "/" || !skinImageUrl) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 bg-stone-200 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${skinImageUrl})` }}
    />
  );
}
