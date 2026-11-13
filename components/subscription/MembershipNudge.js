"use client";

// 무료회원에게 한 번만 보여주는 멤버십 안내(플랫폼 메인 상단 바로 아래). 가입은 무료로 한 단계에
// 끝내고, 유료 멤버십은 이렇게 따로 권합니다 — 닫거나 "멤버십 보기"를 누르면 다시 안 보입니다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { useViewer } from "@/components/ViewerProvider";
import { OneTimeNotice } from "@/lib/oneTimeNotice";
import { MembershipOffer } from "@/lib/subscription";

export default function MembershipNudge() {
  const viewer = useViewer();
  const [isOpen, setIsOpen] = useState(false);
  const eligible = viewer.isSignedIn && MembershipOffer.shouldOffer(viewer);
  const notice = OneTimeNotice.forUser("membership-welcome", viewer.userId);

  // 닫았는지는 브라우저 저장소에서만 알 수 있어서, 그린 직후에 확인합니다.
  useEffect(() => {
    if (!eligible) return undefined;
    const timer = setTimeout(() => setIsOpen(!notice.isDismissed), 0);
    return () => clearTimeout(timer);
  }, [eligible, notice.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!eligible || !isOpen) return null;

  function close() {
    notice.dismiss();
    setIsOpen(false);
  }

  return (
    <aside className="mx-4 mt-4 flex items-start gap-3 rounded-2xl border border-night-200 bg-night-50 p-3.5" aria-label="멤버십 안내">
      <Sparkles size={18} className="mt-0.5 shrink-0 text-night-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900">가입을 환영해요. 멤버십으로 더 가까이 함께해요</p>
        <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
          이미지 갤러리 원본·모바일 배경이미지 받기, 담아두기·감상일기, 운영자 공지를 함께 누릴 수 있어요.
        </p>
        <Link
          href={MembershipOffer.PATH}
          onClick={() => notice.dismiss()}
          className="mt-2 inline-block rounded-full bg-night-700 px-3.5 py-1.5 text-xs font-medium text-white"
        >
          멤버십 보기
        </Link>
      </div>
      <button type="button" onClick={close} className="shrink-0 rounded-full p-1 text-stone-400" aria-label="안내 닫기">
        <X size={16} />
      </button>
    </aside>
  );
}
