"use client";

// 모바일에서만 보이는 "홈 화면에 추가" 안내. 홈 화면 아이콘으로 열면 주소창 없이 플랫폼
// 화면만 꽉 차게 보입니다(일반 브라우저 탭에서는 보안 정책상 주소창을 숨길 수 없어서).
//   · 안드로이드(Chrome 등): "앱으로 설치" 버튼 한 번으로 설치
//   · iPhone(Safari 등): 공유 버튼 → "홈 화면에 추가" 순서를 안내
// 이미 홈 화면 아이콘으로 열었거나, 컴퓨터이거나, 최근(14일)에 닫았으면 보이지 않습니다.

import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { InstallPrompt, WebAppBrand } from "@/lib/webApp";

export default function InstallBanner() {
  const [prompt, setPrompt] = useState(null);
  const [, setVersion] = useState(0); // 설치 가능 여부가 바뀌면 다시 그리기 위한 값
  const [isOpen, setIsOpen] = useState(false);

  // 브라우저 정보는 화면을 그린 뒤에만 읽을 수 있어서, 첫 렌더 직후에 판단합니다.
  useEffect(() => {
    const instance = new InstallPrompt(window);
    const stop = instance.listen(() => setVersion((v) => v + 1));
    const timer = setTimeout(() => {
      setPrompt(instance);
      setIsOpen(instance.shouldShow);
    }, 0);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);

  if (!prompt || !isOpen || prompt.isStandalone) return null;

  function close() {
    prompt.dismiss();
    setIsOpen(false);
  }

  async function install() {
    const installed = await prompt.install();
    if (installed) setIsOpen(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-24 z-30 sm:hidden" role="dialog" aria-label="홈 화면에 추가 안내">
      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-lg">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: WebAppBrand.BRAND_COLOR }}
          aria-hidden
        >
          <span className="h-1 w-6 rounded-full bg-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">홈 화면에 추가하고 앱처럼 보기</p>
          {prompt.canInstallDirectly ? (
            <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
              주소창 없이 {WebAppBrand.SHORT_NAME} 화면만 꽉 차게 열려요.
            </p>
          ) : prompt.isIOS ? (
            <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
              아래(또는 위) 막대의 <Share size={12} className="inline align-[-2px]" /> 공유 버튼을 누르고
              <span className="whitespace-nowrap">
                {" "}
                <SquarePlus size={12} className="inline align-[-2px]" /> &ldquo;홈 화면에 추가&rdquo;
              </span>
              를 선택하세요. 다음부터 아이콘으로 열면 주소창 없이 보여요.
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
              브라우저 메뉴(⋮)에서 &ldquo;홈 화면에 추가&rdquo; 또는 &ldquo;앱 설치&rdquo;를 선택하세요. 다음부터
              아이콘으로 열면 주소창 없이 보여요.
            </p>
          )}
          {prompt.canInstallDirectly && (
            <button
              type="button"
              onClick={install}
              className="mt-2 rounded-full bg-amber-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
            >
              앱으로 설치
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-stone-100"
          aria-label="안내 닫기"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
