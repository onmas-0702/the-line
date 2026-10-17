"use client";

// 모바일에서만 보이는 "홈 화면에 추가" 안내. 홈 화면 아이콘으로 열면 주소창 없이 플랫폼
// 화면만 꽉 차게 보입니다(일반 브라우저 탭에서는 보안 정책상 주소창을 숨길 수 없어서).
//   · 처음엔 아래쪽에 작은 안내 카드 → "방법 보기"를 누르면 브라우저별 단계 안내 창
//   · 카카오톡 등 앱 안에서 열었으면 먼저 Safari/Chrome으로 열도록 안내(카카오톡은 버튼 한 번)
//   · 안드로이드 Chrome은 "앱으로 설치하기" 버튼 한 번으로 설치
//   · 닫으면 14일 동안 카드가 안 뜨고, 랜딩 하단 "홈 화면에 추가하는 방법"으로 언제든 다시 열기
// 단계 내용은 lib/webApp.js의 InstallGuide가 정합니다.

import { useEffect, useState } from "react";
import {
  ArrowDownUp,
  CheckCircle2,
  Copy,
  Ellipsis,
  ExternalLink,
  Menu,
  Share,
  SquarePlus,
  X,
} from "lucide-react";
import { InstallPrompt, WebAppBrand } from "@/lib/webApp";

const STEP_ICONS = {
  share: Share,
  more: Ellipsis,
  menu: Menu,
  plus: SquarePlus,
  check: CheckCircle2,
  scroll: ArrowDownUp,
  external: ExternalLink,
};

const ACTION_ICONS = { "open-external": ExternalLink, "copy-url": Copy, install: SquarePlus };

const RESULT_MESSAGES = {
  copied: "주소를 복사했어요. Safari(또는 Chrome) 주소창을 길게 눌러 붙여넣어 주세요.",
  "copy-failed": "복사하지 못했어요. 주소창의 주소를 길게 눌러 직접 복사해 주세요.",
};

function AppBadge({ size = "h-11 w-11" }) {
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-xl`}
      style={{ background: WebAppBrand.BRAND_COLOR }}
      aria-hidden
    >
      <span className="h-1 w-6 rounded-full bg-white" />
    </span>
  );
}

function GuideSheet({ prompt, onClose, onDone }) {
  const guide = prompt.guide;
  const [result, setResult] = useState(null);

  async function runAction() {
    const outcome = await prompt.run(guide.action);
    if (outcome === "installed") onDone();
    else setResult(outcome);
  }

  const ActionIcon = guide.action ? ACTION_ICONS[guide.action.kind] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" role="dialog" aria-modal aria-label="홈 화면에 추가하는 방법">
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pb-8 pt-5">
        <div className="flex items-start gap-3">
          <AppBadge />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-stone-900">{guide.title}</p>
            <p className="mt-0.5 text-xs text-stone-500">
              한 번만 해두면, 다음부터 아이콘으로 열 때 주소창 없이 {WebAppBrand.SHORT_NAME} 화면만 꽉 차게 보여요.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100" aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        {guide.intro && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">{guide.intro}</p>}

        {guide.steps.length > 0 && (
          <ol className="mt-4 space-y-3">
            {guide.steps.map((step, i) => {
              const Icon = STEP_ICONS[step.icon] || CheckCircle2;
              return (
                <li key={step.text} className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-700 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
                    <Icon size={16} />
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed text-stone-700">{step.text}</p>
                </li>
              );
            })}
          </ol>
        )}

        {guide.action && (
          <button
            type="button"
            onClick={runAction}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-amber-700 py-3 text-sm font-semibold text-white hover:bg-amber-800"
          >
            {ActionIcon && <ActionIcon size={16} />} {guide.action.label}
          </button>
        )}
        {result && RESULT_MESSAGES[result] && <p className="mt-2 text-center text-xs text-stone-500">{RESULT_MESSAGES[result]}</p>}

        {guide.tip && <p className="mt-4 text-xs leading-relaxed text-stone-400">💡 {guide.tip}</p>}
      </div>
    </div>
  );
}

export default function InstallBanner() {
  const [prompt, setPrompt] = useState(null);
  const [, setVersion] = useState(0); // 설치 가능 여부가 바뀌면 다시 그리기 위한 값
  const [isCardOpen, setIsCardOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // 브라우저 정보는 화면을 그린 뒤에만 읽을 수 있어서, 첫 렌더 직후에 판단합니다.
  useEffect(() => {
    const instance = new InstallPrompt(window);
    const stopListening = instance.listen(() => setVersion((v) => v + 1));
    const openGuide = () => {
      if (!instance.canShowGuide) return;
      setIsCardOpen(false);
      setIsSheetOpen(true);
    };
    window.addEventListener(InstallPrompt.OPEN_EVENT, openGuide);
    const timer = setTimeout(() => {
      setPrompt(instance);
      setIsCardOpen(instance.shouldShow);
    }, 0);
    return () => {
      clearTimeout(timer);
      stopListening();
      window.removeEventListener(InstallPrompt.OPEN_EVENT, openGuide);
    };
  }, []);

  if (!prompt || prompt.isStandalone) return null;

  function dismissCard() {
    prompt.dismiss();
    setIsCardOpen(false);
  }

  const guide = prompt.guide;

  return (
    <>
      {isCardOpen && !isSheetOpen && (
        <div className="fixed inset-x-3 bottom-24 z-30 sm:hidden" role="dialog" aria-label="홈 화면에 추가 안내">
          <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-lg">
            <AppBadge />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-stone-900">
                {prompt.env.inApp ? "앱처럼 보려면 브라우저에서 열어 주세요" : "홈 화면에 추가하고 앱처럼 보기"}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">주소창 없이 화면이 꽉 차게 보여요.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              className="shrink-0 rounded-full bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800"
            >
              {guide.action?.kind === "install" ? "설치하기" : "방법 보기"}
            </button>
            <button
              type="button"
              onClick={dismissCard}
              className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-stone-100"
              aria-label="안내 닫기"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {isSheetOpen && (
        <GuideSheet
          prompt={prompt}
          onClose={() => setIsSheetOpen(false)}
          onDone={() => {
            setIsSheetOpen(false);
            setIsCardOpen(false);
          }}
        />
      )}
    </>
  );
}

/** 안내를 닫은 뒤에도 다시 열 수 있는 링크 — 모바일에서 아직 설치하지 않았을 때만 보입니다. */
export function InstallGuideLink({ className = "" }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(new InstallPrompt(window).canShowGuide), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <button type="button" onClick={() => InstallPrompt.requestOpen(window)} className={className}>
      📱 홈 화면에 앱처럼 추가하는 방법
    </button>
  );
}
