// 멤버십 정기결제 — 화면(브라우저)과 서버가 함께 쓰는 값·규칙(0027).
//   SubscriptionPeriod — 이용 기간 계산(한 달 뒤·일 년 뒤, 31일 → 말일)
//   BillingOrderId     — 주문번호(첫 결제: 무작위, 자동갱신: 회원+날짜 → 하루 한 번만)
//   PaymentRecord      — 결제 기록 한 줄. 불변
//   MembershipSummary  — 내 멤버십 화면에 보일 것(상태·다음 결제일·종료일·카드·해지 예약). 불변
//   BillingApi         — 브라우저에서 /api/billing/* 부르기(결제 시작·해지·해지 취소)
//   MembershipRepository — 내 구독·결제 기록 읽기(본인 것만, RLS)
// 실제 결제는 서버 전용 lib/billingServer.js(BillingService)와 lib/inicis.js가 합니다.

import { SupabaseRepository } from "@/lib/supabaseRepository";

export class SubscriptionPeriod {
  /** from에서 한 달(month)·일 년(year) 뒤. 1월 31일 + 한 달 → 2월 말일. */
  static next(from, interval) {
    const start = new Date(from);
    const months = interval === "year" ? 12 : 1;
    const target = new Date(start);
    target.setUTCDate(1);
    target.setUTCMonth(target.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
    return target;
  }
}

export class BillingOrderId {
  /** 첫 결제 주문번호 "TL-첫결제시각-무작위" (40자 이하). */
  static first() {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `TL-${Date.now().toString(36).toUpperCase()}-${random}`;
  }

  /** 자동갱신 주문번호 — 같은 회원·같은 날은 같은 번호라 두 번 결제되지 않습니다. */
  static renewal(userId, date = new Date()) {
    const day = date.toISOString().slice(0, 10).replaceAll("-", "");
    return `RN-${day}-${String(userId).replaceAll("-", "").slice(0, 20)}`;
  }
}

export class PaymentRecord {
  static #STATUS = { paid: "결제 완료", failed: "결제 실패", refunded: "환불", partially_refunded: "부분 환불" };
  static #KIND = { first: "첫 결제", renewal: "자동 결제", onetime: "연간 결제" };

  constructor(row) {
    Object.assign(this, {
      id: row.id,
      planCode: row.plan_code ?? row.planCode,
      kind: row.kind,
      method: row.method || "billing", // billing: 월간 정기결제 상점, onetime: 연간 일반결제 상점
      amount: Number(row.amount) || 0,
      status: row.status,
      tid: row.tid || null,
      cardLabel: row.card_label ?? row.cardLabel ?? "",
      message: row.message || "",
      paidAt: row.paid_at ?? row.paidAt ?? null,
      createdAt: row.created_at ?? row.createdAt ?? null,
      periodEnd: row.period_end ?? row.periodEnd ?? null,
      refundedAmount: Number(row.refunded_amount ?? row.refundedAmount) || 0,
    });
    Object.freeze(this);
  }

  get statusLabel() {
    return PaymentRecord.#STATUS[this.status] || this.status;
  }

  get kindLabel() {
    return PaymentRecord.#KIND[this.kind] || this.kind;
  }

  get amountLabel() {
    return `${this.amount.toLocaleString("ko-KR")}원`;
  }

  get canRefund() {
    return this.status === "paid" && Boolean(this.tid);
  }

  toJSON() {
    const { id, planCode, kind, method, amount, status, tid, cardLabel, message, paidAt, createdAt, periodEnd, refundedAmount } = this;
    return { id, planCode, kind, method, amount, status, tid, cardLabel, message, paidAt, createdAt, periodEnd, refundedAmount };
  }
}

export class MembershipSummary {
  constructor(row) {
    const r = row || {};
    Object.assign(this, {
      planCode: r.plan_code ?? r.planCode ?? null,
      status: r.status || null,
      startedAt: r.started_at ?? r.startedAt ?? null,
      lastPaidAt: r.last_paid_at ?? r.lastPaidAt ?? null,
      periodEnd: r.current_period_end ?? r.periodEnd ?? null,
      cancelAtPeriodEnd: Boolean(r.cancel_at_period_end ?? r.cancelAtPeriodEnd),
      canceledAt: r.canceled_at ?? r.canceledAt ?? null,
      cardLabel: r.card_label ?? r.cardLabel ?? "",
      failedAttempts: Number(r.failed_attempts ?? r.failedAttempts) || 0,
      autoRenew: (r.auto_renew ?? r.autoRenew) !== false, // 연간 1회 결제는 false
    });
    Object.freeze(this);
  }

  /** 지금 구독 기능을 쓸 수 있는지(DB is_paid_member와 같은 규칙). */
  get isActive() {
    if (!["trialing", "active", "past_due"].includes(this.status)) return false;
    return !this.periodEnd || new Date(this.periodEnd) > new Date();
  }

  get isYearly() {
    return this.planCode === "membership_yearly";
  }

  get planLabel() {
    return this.isYearly ? "연간 멤버십" : this.planCode ? "월간 멤버십" : "";
  }

  /** "다음 결제일" — 월간 자동결제가 살아 있을 때만. */
  get nextBillingAt() {
    return this.isActive && this.autoRenew && !this.cancelAtPeriodEnd ? this.periodEnd : null;
  }

  /** "이용 종료일" — 연간 1회 결제, 해지 예약, 이미 해지됐을 때. */
  get endsAt() {
    return !this.autoRenew || this.cancelAtPeriodEnd || this.status === "canceled" ? this.periodEnd : null;
  }

  get statusLabel() {
    if (!this.status) return "가입 안 함";
    if (this.status === "past_due") return "결제 실패(다시 시도 중)";
    if (this.status === "canceled" || !this.isActive) return "해지됨";
    if (this.cancelAtPeriodEnd) return "해지 예약됨";
    return this.autoRenew ? "이용 중" : "이용 중(1년)";
  }

  /** 해지는 월간 자동결제만(연간은 자동으로 다시 결제되지 않아 해지할 것이 없음). */
  get canCancel() {
    return this.isActive && this.autoRenew && !this.cancelAtPeriodEnd;
  }

  get canResume() {
    return this.isActive && this.autoRenew && this.cancelAtPeriodEnd;
  }

  /** "2026.12.20" */
  static date(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const kst = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;
  }

  toJSON() {
    const { planCode, status, startedAt, lastPaidAt, periodEnd, cancelAtPeriodEnd, canceledAt, cardLabel, failedAttempts, autoRenew } = this;
    return { planCode, status, startedAt, lastPaidAt, periodEnd, cancelAtPeriodEnd, canceledAt, cardLabel, failedAttempts, autoRenew };
  }
}

/** 브라우저 → 결제 API. 결과 { ok, ... } | { ok: false, message }. */
export class BillingApi {
  static async #post(url, body = {}) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) return data;
      return { ok: false, message: data.message || "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
    } catch {
      return { ok: false, message: "연결이 끊겼어요. 잠시 뒤 다시 시도해 주세요." };
    }
  }

  /** 결제창 준비 → 월간 { ok, mode: "billing", oid, action, fields } · 연간 { ok, mode: "onetime", oid, sdkUrl, jqueryUrl, params } */
  static checkout(planCode, buyerTel, isMobile = false) {
    return BillingApi.#post("/api/billing/checkout", { planCode, buyerTel, isMobile });
  }

  /** 가입 확정(첫 결제) — 카드 등록을 마친 주문을 한 번만 결제 */
  static confirm(oid) {
    return BillingApi.#post("/api/billing/confirm", { oid });
  }

  static cancel() {
    return BillingApi.#post("/api/billing/cancel");
  }

  static resume() {
    return BillingApi.#post("/api/billing/resume");
  }
}

/** 내 멤버십 — 구독 한 줄과 결제 기록(본인 것만 읽힘, 0027 RLS). */
export class MembershipRepository extends SupabaseRepository {
  /** → { ok, summary: MembershipSummary, payments: PaymentRecord[] } */
  async loadMine(userId) {
    if (!this.configured || !userId) return SupabaseRepository.ok({ summary: new MembershipSummary(null), payments: [] });
    const [sub, pays] = await Promise.all([
      this.client.from("member_subscriptions").select("*").eq("user_id", userId).maybeSingle(),
      this.client.from("payments").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);
    return SupabaseRepository.ok({
      summary: new MembershipSummary(sub.data),
      payments: pays.error ? [] : (pays.data || []).map((row) => new PaymentRecord(row)),
    });
  }
}
