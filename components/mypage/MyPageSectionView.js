"use client";

// /mypage/{key} — 권한(FeatureGate)을 확인하고, 등록된 섹션 화면을 그립니다.

import Link from "next/link";
import { Lock } from "lucide-react";
import { useViewer } from "@/components/ViewerProvider";
import { MY_PAGE_SECTION_VIEWS } from "@/components/mypage/sections";
import { MyPageMenu } from "@/lib/myPage";
import { SubscriptionPaths } from "@/lib/subscription";

export default function MyPageSectionView({ sectionKey }) {
  const viewer = useViewer();
  const section = MyPageMenu.find(sectionKey);
  const View = MY_PAGE_SECTION_VIEWS[sectionKey];
  if (!section || !View) return null;

  const gate = section.gateFor(viewer);
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-stone-900">{section.label}</h2>
        <p className="text-xs text-stone-500">{section.description}</p>
      </div>
      {gate.allowed ? (
        <View />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-10 text-center">
          <Lock size={22} className="text-stone-300" />
          <p className="text-sm text-stone-600">{section.label}은(는) 구독자 전용 메뉴예요.</p>
          <Link
            href={SubscriptionPaths.PRICING}
            className="rounded-full bg-amber-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
          >
            구독 안내 보기
          </Link>
        </div>
      )}
    </div>
  );
}
