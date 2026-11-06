"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Bookmark, Check, Megaphone, MessageCircle, NotebookPen } from "lucide-react";
import { AccessPolicy, Viewer } from "@/lib/access";
import { AuthPaths } from "@/lib/auth";
import { PLATFORM_TITLE } from "@/lib/mockData";
import { MyPageMenu } from "@/lib/myPage";
import { PaymentGateway, Plan, SubscriptionPaths, SubscriptionStatus, SubscriptionTerms } from "@/lib/subscription";

const BENEFITS = [
  { icon: Megaphone, text: "운영자 공지를 마이 페이지에서 바로 확인" },
  { icon: Bookmark, text: "좋아요·담아두기한 메시지를 모아 보고 검색" },
  { icon: NotebookPen, text: "메시지마다 나만의 감상일기 기록" },
  { icon: MessageCircle, text: "카카오톡 오픈채팅 커뮤니티 참여" },
  { icon: BookOpen, text: "모든 메시지 듣기·댓글은 무료회원도 그대로" },
];

export default function PricingView({ viewer: viewerData, plans: planData }) {
  const viewer = useMemo(() => Viewer.fromJSON(viewerData), [viewerData]);
  const plans = useMemo(() => planData.map((p) => new Plan(p)), [planData]);
  const monthly = plans.find((p) => !p.isYearly);
  const [selectedCode, setSelectedCode] = useState(plans.find((p) => p.isYearly)?.code || plans[0]?.code);
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState("");
  const selected = plans.find((p) => p.code === selectedCode) || plans[0];

  async function checkout() {
    setMessage("");
    if (!agreed) return setMessage("결제 안내를 확인하고 동의해 주세요.");
    const result = await PaymentGateway.current().startCheckout({ plan: selected, viewer, origin: window.location.origin });
    if (!result.ok) setMessage(result.reason);
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-stone-900">구독하기</h1>
        <p className="mt-2 text-sm text-stone-500">{PLATFORM_TITLE}을 더 가까이에서 함께해 주세요.</p>
      </div>

      <ul className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5 text-sm text-stone-700">
            <Icon size={16} className="shrink-0 text-amber-700" /> {text}
          </li>
        ))}
      </ul>

      {viewer.isSubscriber ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-800">
          이미 구독 중이에요 ({new SubscriptionStatus(viewer.subscription).label}).{" "}
          <Link href={MyPageMenu.BASE_PATH} className="font-medium underline">
            마이 페이지로 가기
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {plans.map((plan) => {
              const active = plan.code === selected?.code;
              const savings = plan.savingsAgainst(monthly);
              return (
                <button
                  key={plan.code}
                  type="button"
                  onClick={() => setSelectedCode(plan.code)}
                  className={`relative rounded-2xl border p-4 text-left transition ${
                    active ? "border-amber-700 bg-amber-50 ring-2 ring-amber-100" : "border-stone-200 bg-white hover:bg-stone-50"
                  }`}
                >
                  {active && <Check size={16} className="absolute right-3 top-3 text-amber-700" />}
                  <p className="text-sm font-medium text-stone-600">{plan.isYearly ? "연간" : "월간"}</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">{plan.priceLabel}</p>
                  <p className="text-xs text-stone-400">/ {plan.intervalLabel}</p>
                  {savings > 0 && <p className="mt-2 text-xs font-medium text-amber-700">{savings.toLocaleString("ko-KR")}원 절약</p>}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold text-stone-700">결제 전에 꼭 확인해 주세요</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-stone-600">
                {SubscriptionTerms.lines(selected).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <label className="mt-3 flex items-start gap-2 text-xs text-stone-700">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-amber-700" />
                위 내용과 <Link href="/terms" className="underline">이용약관</Link>·환불정책을 확인했고 정기결제에 동의합니다.
              </label>
            </div>
          )}

          {AccessPolicy.canStartSubscription(viewer) ? (
            <button
              type="button"
              onClick={checkout}
              className="w-full rounded-xl bg-amber-700 py-3 text-sm font-semibold text-white transition hover:bg-amber-800"
            >
              {selected ? `${selected.priceLabel} 카드로 구독하기` : "구독하기"}
            </button>
          ) : (
            <Link
              href={AuthPaths.login(SubscriptionPaths.PRICING)}
              className="block w-full rounded-xl bg-amber-700 py-3 text-center text-sm font-semibold text-white transition hover:bg-amber-800"
            >
              로그인하고 구독하기
            </Link>
          )}
          {message && <p className="text-center text-sm text-amber-700">{message}</p>}
        </>
      )}
    </div>
  );
}
