"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Bookmark, Check, Images, Megaphone, MessageCircle, NotebookPen } from "lucide-react";
import { AccessPolicy, Viewer } from "@/lib/access";
import { AuthPaths } from "@/lib/auth";
import { FeatureFlags } from "@/lib/featureFlags";
import { PLATFORM_TITLE } from "@/lib/mockData";
import { MyPageMenu } from "@/lib/myPage";
import { MembershipOffer, PaymentGateway, Plan, SubscriptionPaths, SubscriptionStatus, SubscriptionTerms } from "@/lib/subscription";

const BENEFITS = [
  { icon: Megaphone, text: "운영자 공지를 마이 페이지에서 바로 확인" },
  { icon: Bookmark, text: "좋아요·담아두기한 메시지를 모아 보고 검색" },
  { icon: NotebookPen, text: "메시지마다 나만의 감상일기 기록" },
  { icon: Images, text: "이미지 갤러리 원본·모바일 배경이미지 다운로드, 마이 갤러리" },
  { icon: MessageCircle, text: "카카오톡 오픈채팅 커뮤니티 참여", enabled: FeatureFlags.OPEN_CHAT },
  { icon: BookOpen, text: "모든 메시지 듣기·댓글은 무료회원도 그대로" },
].filter((benefit) => benefit.enabled !== false);

export default function PricingView({ viewer: viewerData, plans: planData }) {
  const viewer = useMemo(() => Viewer.fromJSON(viewerData), [viewerData]);
  const plans = useMemo(() => planData.map((p) => new Plan(p)), [planData]);
  const monthly = plans.find((p) => !p.isYearly);
  const [selectedCode, setSelectedCode] = useState(plans.find((p) => p.isYearly)?.code || plans[0]?.code);
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false); // 결제창을 여는 중(두 번 누르기 막기)
  const [buyerTel, setBuyerTel] = useState(""); // 자동결제 승인에 필요한 연락처(정기결제일 때)
  const router = useRouter();
  const selected = plans.find((p) => p.code === selectedCode) || plans[0];

  const gateway = useMemo(() => PaymentGateway.current(), []);
  const canStart = AccessPolicy.canStartSubscription(viewer);
  const needsPhone = Boolean(gateway.needsPhone?.(selected));
  // 연간 1회 결제는 결제창을 미리 준비해 둡니다(누른 뒤 기다렸다가 열면 브라우저가 팝업을 막음).
  const [prepared, setPrepared] = useState(null); // { planCode, prepared } | null
  const [prepareKey, setPrepareKey] = useState(0); // 실패·취소 뒤 다시 준비
  const needsPreparation = Boolean(canStart && gateway.needsPreparation?.(selected));

  useEffect(() => {
    if (!needsPreparation || !selected) return undefined;
    let cancelled = false;
    gateway.prepareOneTime(selected).then((result) => {
      if (cancelled) return;
      if (result.ok) setPrepared({ planCode: selected.code, prepared: result.prepared });
      else setMessage(result.reason);
    });
    return () => {
      cancelled = true;
    };
  }, [needsPreparation, selected, gateway, prepareKey]);

  async function checkout() {
    setMessage("");
    if (!agreed) return setMessage("결제 안내를 확인하고 동의해 주세요.");
    if (busy) return;
    if (needsPhone && buyerTel.replace(/\D/g, "").length < 9) return setMessage("연락처를 입력해 주세요. 자동 결제 승인에 필요해요.");
    if (needsPreparation) {
      const ready = prepared?.planCode === selected.code ? prepared.prepared : null;
      if (!ready) return setMessage("결제창을 준비하고 있어요. 잠시 뒤 다시 눌러 주세요.");
      setPrepared(null); // 준비한 주문은 한 번만 씁니다
      // 결제창을 닫으면 결과가 오지 않으므로 기다리는 동안 버튼을 잠그지 않습니다. 다음 시도를 위해 새로 준비해 둬요.
      setMessage("결제창에서 결제를 진행해 주세요.");
      setPrepareKey((k) => k + 1);
      gateway.payOneTime(ready).then((outcome) => {
        setMessage(outcome.ok ? outcome.notice || "" : outcome.reason);
        if (outcome.ok && outcome.redirectTo) router.push(outcome.redirectTo);
      });
      return;
    }
    setBusy(true);
    const result = await gateway.startCheckout({ plan: selected, viewer, origin: window.location.origin, buyerTel });
    setBusy(false);
    setMessage(result.ok ? result.notice || "" : result.reason);
    if (result.ok && result.redirectTo) router.push(result.redirectTo);
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-stone-900">{MembershipOffer.JOIN_LABEL}</h1>
        <p className="mt-2 text-sm text-stone-500">{PLATFORM_TITLE}을 더 가까이에서 함께해 주세요.</p>
      </div>

      <ul className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5 text-sm text-stone-700">
            <Icon size={16} className="shrink-0 text-night-700" /> {text}
          </li>
        ))}
      </ul>

      {AccessPolicy.isAdmin(viewer) && !viewer.isSubscriber ? (
        <div className="rounded-2xl border border-[#e8c58e] bg-[#fbf1df] p-4 text-center text-sm text-night-800">
          관리자 계정은 멤버십 없이 모든 기능을 이용할 수 있어요.{" "}
          <Link href={MyPageMenu.BASE_PATH} className="font-medium underline">
            마이 페이지로 가기
          </Link>
        </div>
      ) : viewer.isSubscriber ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-800">
          이미 멤버십을 이용 중이에요 ({new SubscriptionStatus(viewer.subscription).label}).{" "}
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
                  aria-pressed={active}
                  className={`lamp-soft relative rounded-2xl border p-4 text-left transition duration-300 ${
                    active ? "border-night-700 bg-night-50 ring-2 ring-night-100" : "border-stone-200 bg-white"
                  }`}
                >
                  {active && <Check size={16} className="absolute right-3 top-3 text-night-700" />}
                  <p className="text-sm font-medium text-stone-600">{plan.isYearly ? "연간" : "월간"}</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">{plan.priceLabel}</p>
                  <p className="text-xs text-stone-400">/ {plan.intervalLabel}</p>
                  {savings > 0 && <p className="mt-2 text-xs font-medium text-night-700">{savings.toLocaleString("ko-KR")}원 절약</p>}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold text-stone-700">결제 전에 꼭 확인해 주세요</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-stone-600">
                {SubscriptionTerms.lines(selected, { recurring: gateway.isRecurring }).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <label className="mt-3 flex items-start gap-2 text-xs text-stone-700">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-night-700" />
                위 내용과 <Link href="/terms" className="underline">이용약관</Link>·환불정책을 확인했고{" "}
                {gateway.isRecurring && !selected.isYearly ? "정기결제에" : "결제에"} 동의합니다.
              </label>
            </div>
          )}

          {needsPhone && canStart && (
            <label className="block text-xs font-medium text-stone-700">
              연락처
              <input
                value={buyerTel}
                onChange={(e) => setBuyerTel(e.target.value.replace(/[^\d-]/g, "").slice(0, 13))}
                inputMode="tel"
                autoComplete="tel"
                placeholder="010-0000-0000"
                className="mt-1 block w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-night-600"
              />
              <span className="mt-1 block font-normal text-stone-400">카드 자동 결제 승인에만 쓰여요.</span>
            </label>
          )}

          {AccessPolicy.canStartSubscription(viewer) ? (
            <button
              type="button"
              onClick={checkout}
              disabled={busy}
              className="w-full rounded-xl bg-night-700 py-3 text-sm font-semibold text-white transition hover:bg-night-800 disabled:opacity-60"
            >
              {busy ? "결제창을 여는 중…" : selected ? `${selected.priceLabel} ${MembershipOffer.JOIN_LABEL}하기` : `${MembershipOffer.JOIN_LABEL}하기`}
            </button>
          ) : (
            <Link
              href={AuthPaths.login(SubscriptionPaths.PRICING)}
              className="block w-full rounded-xl bg-night-700 py-3 text-center text-sm font-semibold text-white transition hover:bg-night-800"
            >
              로그인하고 {MembershipOffer.JOIN_LABEL}하기
            </Link>
          )}
          {!gateway.isRecurring && AccessPolicy.canStartSubscription(viewer) && (
            <p className="text-center text-xs leading-relaxed text-stone-500">
              결제 창의 구매자 이메일에 가입한 이메일({viewer.email || "로그인한 이메일"})을 적어 주세요. 결제를
              확인한 뒤 그 계정에 멤버십을 열어 드려요.
            </p>
          )}
          {message && <p className="text-center text-sm text-night-700">{message}</p>}
        </>
      )}
    </div>
  );
}
