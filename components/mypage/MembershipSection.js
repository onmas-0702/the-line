"use client";

// 마이 페이지 > 멤버십 — 상태, 구독 시작일·최근 결제일·다음 결제일(또는 이용 종료일), 카드, 해지·해지 취소, 결제 내역.
// 읽기는 MembershipRepository(본인 것만), 해지는 서버(/api/billing/cancel·resume). 규칙은 lib/billing.js.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Receipt } from "lucide-react";
import { useViewer } from "@/components/ViewerProvider";
import { BillingApi, MembershipRepository, MembershipSummary } from "@/lib/billing";
import { SubscriptionPaths } from "@/lib/subscription";
import { SupportContact } from "@/lib/support";

export default function MembershipSection() {
  const viewer = useViewer();
  const [repo] = useState(() => new MembershipRepository());
  const [state, setState] = useState(null); // { summary, payments }
  const [isConfirming, setIsConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    repo.loadMine(viewer.userId).then((result) => {
      if (!cancelled) setState({ summary: result.summary, payments: result.payments });
    });
    return () => {
      cancelled = true;
    };
  }, [repo, viewer.userId]);

  async function run(action, done) {
    setBusy(true);
    setMessage("");
    const result = await action();
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    setState((s) => ({ ...s, summary: new MembershipSummary(result.summary) }));
    setIsConfirming(false);
    setMessage(done);
  }

  if (!state) return <p className="py-10 text-center text-sm text-stone-400">불러오는 중…</p>;
  const { summary, payments } = state;
  const date = MembershipSummary.date;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-stone-900">{summary.planLabel || "멤버십"}</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              summary.isActive && !summary.cancelAtPeriodEnd
                ? "bg-emerald-50 text-emerald-700"
                : summary.isActive
                  ? "bg-amber-50 text-amber-700"
                  : "bg-stone-100 text-stone-500"
            }`}
          >
            {summary.statusLabel}
          </span>
        </div>

        {summary.status ? (
          <dl className="divide-y divide-stone-100 border-y border-stone-100 text-sm">
            <Row label="구독 시작일">{date(summary.startedAt)}</Row>
            <Row label="최근 결제일">{date(summary.lastPaidAt)}</Row>
            {summary.nextBillingAt && <Row label="다음 결제일">{date(summary.nextBillingAt)}</Row>}
            {summary.endsAt && <Row label="이용 종료일">{date(summary.endsAt)}</Row>}
            {summary.cardLabel && (
              <Row label="결제 카드">
                <span className="inline-flex items-center gap-1">
                  <CreditCard size={13} className="text-stone-400" /> {summary.cardLabel}
                </span>
              </Row>
            )}
          </dl>
        ) : (
          <p className="text-sm text-stone-500">아직 멤버십에 가입하지 않았어요.</p>
        )}

        {summary.status === "past_due" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            등록한 카드로 결제하지 못했어요. 며칠 동안 다시 시도하고, 계속 실패하면 멤버십이 해지돼요. 카드 상태를 확인해 주세요.
          </p>
        )}
        {!summary.autoRenew && summary.isActive && (
          <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
            연간 멤버십은 1회 결제라 자동으로 다시 결제되지 않아요. {date(summary.periodEnd)}까지 이용할 수 있고, 계속 이용하려면 그 뒤에
            다시 가입해 주세요.
          </p>
        )}
        {summary.cancelAtPeriodEnd && summary.isActive && (
          <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
            해지를 예약했어요. {date(summary.periodEnd)}까지 이용할 수 있고, 그 뒤로는 결제되지 않아요.
          </p>
        )}
        {message && (
          <p role="status" className="rounded-lg bg-night-50 px-3 py-2 text-xs text-night-800">
            {message}
          </p>
        )}

        {summary.canCancel &&
          (isConfirming ? (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
              <p className="text-xs leading-relaxed text-stone-700">
                해지하면 <b>{date(summary.periodEnd)}</b>까지는 지금처럼 이용하고, 그다음 결제부터 멈춰요. 이미 결제한 금액의 환불은 환불정책에
                따라요.
              </p>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setIsConfirming(false)} className="flex-1 rounded-full border border-stone-300 bg-white py-1.5 text-xs">
                  그대로 둘게요
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(BillingApi.cancel, "해지를 예약했어요.")}
                  className="flex-1 rounded-full bg-rose-600 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "처리 중…" : "해지하기"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              className="w-full rounded-full border border-stone-300 py-2 text-sm text-stone-600 hover:border-rose-300 hover:text-rose-600"
            >
              멤버십 해지
            </button>
          ))}
        {summary.canResume && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(BillingApi.resume, "해지 예약을 취소했어요. 다음 결제일에 자동으로 결제돼요.")}
            className="w-full rounded-full bg-night-700 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "처리 중…" : "해지 취소하고 계속 이용"}
          </button>
        )}
        {!summary.isActive && (
          <Link href={SubscriptionPaths.PRICING} className="block w-full rounded-full bg-night-700 py-2 text-center text-sm font-semibold text-white">
            멤버십 가입하기
          </Link>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-stone-900">
          <Receipt size={15} className="text-stone-500" /> 결제 내역
        </h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-xs text-stone-400">결제 내역이 없어요.</p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-100">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                <span className="min-w-0">
                  <span className="block text-stone-800">
                    {date(p.paidAt || p.createdAt)} · {p.kindLabel}
                  </span>
                  {p.message && p.status !== "paid" && <span className="block truncate text-stone-400">{p.message}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-medium tabular-nums text-stone-900">{p.amountLabel}</span>
                  <span className={p.status === "paid" ? "text-emerald-600" : p.status === "failed" ? "text-rose-500" : "text-stone-500"}>
                    {p.statusLabel}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-stone-400">
          환불·결제 문의는 <Link href={SupportContact.PATH} className="underline">고객지원</Link>으로 알려 주세요.
        </p>
      </section>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right text-stone-800">{children}</dd>
    </div>
  );
}
