"use client";

// 전체 배경 이미지 스킨 — "제작/관리 → 디자인 적용"에서 적용한 이미지가 있으면
// 모든 페이지 뒤에 고정된 전체 화면 배경으로 깔립니다. 콘텐츠 카드들은 흰 배경을
// 그대로 유지해서(반투명 헤더/네비게이션 제외) 가독성은 유지하면서, 카드 사이
// 여백과 상/하단에서 이미지가 비쳐 보이는 "배경 이미지 위 콘텐츠 오버레이" 방식입니다.
import { useAppStore } from "@/lib/store";

export default function SiteBackground() {
  const { skinImageUrl } = useAppStore();

  if (!skinImageUrl) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 bg-stone-200 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${skinImageUrl})` }}
    />
  );
}
