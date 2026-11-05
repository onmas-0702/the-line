// 플랫폼 유료 구독(월 5천·연 5만). 수익은 전부 플랫폼 것이고(정산 없음), 구독 행의
// channel_id(범위)는 나중에 채널별 구독을 열 때를 위해 비워 둡니다(0015 마이그레이션).
//
//   Plan / PlanRepository        — 판매 중인 요금제
//   PaymentGateway               — 결제대행사(PG) 연결의 공통 틀. 지금은 PendingPaymentGateway
//                                  (결제 준비 중)뿐이고, 사업자등록·PG 계약 후 TossPaymentsGateway
//                                  같은 하위 클래스만 추가하면 화면은 그대로 씁니다.
//   SubscriptionTerms            — 결제 전에 꼭 보여줘야 하는 안내(자동갱신·해지·환불)
//
// 구독 행(member_subscriptions)은 브라우저에서 쓸 수 없습니다 — PG 결제 완료 웹훅을 받는
// 서버(service role)나, 운영자가 SQL로 직접 지급할 때만 만들어집니다(docs 참고).

import { SupabaseRepository } from "@/lib/supabaseRepository";

export class SubscriptionPaths {
  static PRICING = "/pricing";
}

export class Plan {
  static Kind = Object.freeze({ MEMBERSHIP: "membership", STUDIO: "studio" });
  static Interval = Object.freeze({ MONTH: "month", YEAR: "year" });

  constructor({ code, name, kind, priceKrw, interval, description = "" }) {
    Object.assign(this, { code, name, kind, priceKrw, interval, description });
    Object.freeze(this);
  }

  static fromRow(row) {
    return new Plan({
      code: row.code,
      name: row.name,
      kind: row.kind || Plan.Kind.MEMBERSHIP,
      priceKrw: row.price_krw,
      interval: row.billing_interval,
      description: row.description || "",
    });
  }

  /** DB에 요금제가 아직 없을 때(마이그레이션 0015 적용 전) 보여줄 기본 구독 요금제. */
  static defaults() {
    return [
      new Plan({ code: "membership_monthly", name: "구독 (월간)", kind: "membership", priceKrw: 5000, interval: "month" }),
      new Plan({ code: "membership_yearly", name: "구독 (연간)", kind: "membership", priceKrw: 50000, interval: "year", description: "월간보다 두 달 무료" }),
    ];
  }

  get isYearly() {
    return this.interval === Plan.Interval.YEAR;
  }

  get priceLabel() {
    return `${this.priceKrw.toLocaleString("ko-KR")}원`;
  }

  get intervalLabel() {
    return this.isYearly ? "1년" : "1개월";
  }

  /** 같은 종류의 월간 요금제보다 1년에 얼마 아끼는지(연간 요금제만). */
  savingsAgainst(monthlyPlan) {
    if (!this.isYearly || !monthlyPlan) return 0;
    return Math.max(0, monthlyPlan.priceKrw * 12 - this.priceKrw);
  }
}

export class PlanRepository extends SupabaseRepository {
  static TABLE = "plans";

  async listMembership() {
    if (!this.configured) return SupabaseRepository.ok({ plans: Plan.defaults() });
    const { data, error } = await this.client
      .from(PlanRepository.TABLE)
      .select("*")
      .eq("is_active", true)
      .eq("kind", Plan.Kind.MEMBERSHIP)
      .order("price_krw", { ascending: true });
    if (error || !data?.length) return SupabaseRepository.ok({ plans: Plan.defaults(), fallback: true });
    return SupabaseRepository.ok({ plans: data.map(Plan.fromRow) });
  }
}

/** 구독 상태를 사람이 읽는 말로. viewer.subscription({ planCode, status, currentPeriodEnd }) 기준. */
export class SubscriptionStatus {
  static #LABELS = {
    trialing: "체험 중",
    active: "구독 중",
    past_due: "결제 실패(재시도 중)",
    canceled: "해지됨",
    pending: "결제 대기",
  };

  constructor(subscription) {
    this.subscription = subscription || null;
    Object.freeze(this);
  }

  get label() {
    return this.subscription ? SubscriptionStatus.#LABELS[this.subscription.status] || this.subscription.status : "구독 안 함";
  }

  get periodEndLabel() {
    const end = this.subscription?.currentPeriodEnd;
    return end ? String(end).slice(0, 10).replaceAll("-", ".") : "";
  }
}

/** 결제대행사 연결의 공통 틀. 하위 클래스는 startCheckout만 구현하면 됩니다. */
export class PaymentGateway {
  get id() {
    throw new Error("PaymentGateway.id를 구현하세요");
  }

  get isReady() {
    return false;
  }

  /** 정기결제(빌링) 등록 화면을 엽니다. 결과: { ok, reason } */
  async startCheckout({ plan, viewer, origin }) {
    throw new Error("PaymentGateway.startCheckout을 구현하세요");
  }

  /** 환경변수 NEXT_PUBLIC_PAYMENT_PROVIDER로 고릅니다. 지금은 결제 준비 중 하나뿐. */
  static current() {
    return new PendingPaymentGateway();
  }
}

/** 사업자등록·PG 계약 전 — 결제 대신 안내만 합니다. */
export class PendingPaymentGateway extends PaymentGateway {
  get id() {
    return "pending";
  }

  async startCheckout() {
    return SupabaseRepository.fail("카드 결제는 준비 중이에요. 정식 오픈 때 알려드릴게요.");
  }
}

/** 결제 전에 보여줘야 하는 안내(전자상거래법상 청약철회·자동갱신 고지). 실제 문구는
 *  약관·환불정책 확정 후 법률 검토를 거쳐 바꿔야 합니다. */
export class SubscriptionTerms {
  static lines(plan) {
    return [
      `${plan.intervalLabel}마다 ${plan.priceLabel}이 등록한 카드로 자동 결제돼요. 언제든 My Page에서 해지할 수 있고, 해지하면 다음 결제일부터 결제되지 않아요.`,
      "결제 후 7일 이내이고 구독 기능(담아두기·감상일기·공지·오픈채팅)을 쓰지 않았다면 전액 환불받을 수 있어요.",
      plan.isYearly
        ? "연간 구독을 중간에 해지하면 쓴 기간만큼을 뺀 금액을 환불 규정에 따라 돌려드려요."
        : "월간 구독은 이미 시작된 달의 요금은 환불되지 않아요(첫 결제 7일 이내 미사용 제외).",
      "가격이 바뀌거나 무료 혜택이 유료로 바뀔 때는 미리 알려드리고 다시 동의를 받아요.",
    ];
  }
}
