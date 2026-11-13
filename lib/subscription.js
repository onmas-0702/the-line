// 플랫폼 유료 구독(월 5천·연 5만). 수익은 전부 플랫폼 것이고(정산 없음), 구독 행의
// channel_id(범위)는 나중에 채널별 구독을 열 때를 위해 비워 둡니다(0015 마이그레이션).
//
//   Plan / PlanRepository        — 판매 중인 요금제
//   PaymentGateway               — 결제대행사(PG) 연결의 공통 틀. 화면은 이 틀만 씁니다.
//     · PendingPaymentGateway    — 결제 준비 중(기본값)
//     · InicisLinkPaymentGateway — KG이니시스 상점관리자에서 만든 "결제 링크"로 보내는 임시 방식.
//                                  1회 결제라 자동 갱신이 아니고, 결제 확인 후 운영자가 멤버십을
//                                  직접 지급합니다(docs의 SQL). 정기결제(빌링) 정식 연동은 이 자리에
//                                  InicisBillingGateway 같은 하위 클래스를 추가하면 됩니다.
//   SubscriptionTerms            — 결제 전에 꼭 보여줘야 하는 안내(자동갱신·해지·환불)
//
// 구독 행(member_subscriptions)은 브라우저에서 쓸 수 없습니다 — PG 결제 완료 웹훅을 받는
// 서버(service role)나, 운영자가 SQL로 직접 지급할 때만 만들어집니다(docs 참고).

import { FeatureFlags } from "@/lib/featureFlags";
import { SupabaseRepository } from "@/lib/supabaseRepository";

export class SubscriptionPaths {
  static PRICING = "/pricing";
}

/** 유료 구독을 화면에서는 "멤버십"이라고 부릅니다. 이름과 "누구에게 권할지"를 한곳에서 정합니다.
 *  채널이 하나뿐인 지금은 채널마다가 아니라 플랫폼 메인에서 바로 멤버십에 가입합니다(2026-11 결정). */
export class MembershipOffer {
  static LABEL = "멤버십";
  static JOIN_LABEL = "멤버십 가입";
  static ACTIVE_LABEL = "멤버십 이용 중";
  static PATH = SubscriptionPaths.PRICING;

  /** 멤버십을 권할 사람 — 아직 구독자가 아니고, 채널 운영자도 아닌 사람(방문자·무료회원). */
  static shouldOffer(viewer) {
    return !viewer.isSubscriber && !viewer.isChannelStaff;
  }
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

  /** 카드를 등록해 자동으로 다시 결제되는지(정기결제). 결제 전 안내 문구가 이것에 맞춰 바뀝니다. */
  get isRecurring() {
    return true;
  }

  /** 정기결제(빌링) 등록 화면을 엽니다. 결과: { ok, reason } */
  async startCheckout({ plan, viewer, origin }) {
    throw new Error("PaymentGateway.startCheckout을 구현하세요");
  }

  /** 환경변수 NEXT_PUBLIC_PAYMENT_PROVIDER로 고릅니다 — "inicis-link"면 KG이니시스 결제 링크,
   *  그 외(비어 있음 포함)는 결제 준비 중. */
  static current() {
    if (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER === "inicis-link") return new InicisLinkPaymentGateway();
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

/** KG이니시스 결제 링크(임시) — 상점관리자에서 요금제별로 만든 결제 링크로 보냅니다.
 *  링크는 환경변수로 넣습니다(배포 환경변수에 넣고 다시 배포):
 *    NEXT_PUBLIC_PAYMENT_PROVIDER=inicis-link
 *    NEXT_PUBLIC_INICIS_LINK_MEMBERSHIP_MONTHLY=https://…   (월간 5,000원 링크)
 *    NEXT_PUBLIC_INICIS_LINK_MEMBERSHIP_YEARLY=https://…    (연간 50,000원 링크)
 *  결제 결과가 사이트로 자동으로 돌아오지 않아서, 운영자가 이니시스 결제 내역을 보고 멤버십을
 *  직접 지급합니다. 결제자를 찾기 쉽도록 결제 창에 회원 이메일을 적어 달라고 안내합니다. */
export class InicisLinkPaymentGateway extends PaymentGateway {
  static LINKS = {
    membership_monthly: process.env.NEXT_PUBLIC_INICIS_LINK_MEMBERSHIP_MONTHLY || "",
    membership_yearly: process.env.NEXT_PUBLIC_INICIS_LINK_MEMBERSHIP_YEARLY || "",
  };

  get id() {
    return "inicis-link";
  }

  get isReady() {
    return Object.values(InicisLinkPaymentGateway.LINKS).some(Boolean);
  }

  get isRecurring() {
    return false;
  }

  linkFor(plan) {
    return InicisLinkPaymentGateway.LINKS[plan.code] || "";
  }

  async startCheckout({ plan }) {
    const url = this.linkFor(plan);
    if (!url) return SupabaseRepository.fail("이 요금제의 결제 링크를 준비하고 있어요. 잠시 후 다시 시도해 주세요.");
    window.open(url, "_blank", "noopener");
    return SupabaseRepository.ok({
      notice: "KG이니시스 결제 창을 새 창으로 열었어요. 결제를 마치면 운영자 확인 후 멤버십이 열려요(보통 하루 안).",
    });
  }
}

/** 결제 전에 보여줘야 하는 안내(전자상거래법상 청약철회·자동갱신 고지). 실제 문구는
 *  약관·환불정책 확정 후 법률 검토를 거쳐 바꿔야 합니다. */
export class SubscriptionTerms {
  /** recurring: 정기결제(자동 갱신)인지 — 결제 링크 같은 1회 결제면 false. */
  static lines(plan, { recurring = true } = {}) {
    return [
      recurring
        ? `${plan.intervalLabel}마다 ${plan.priceLabel}이 등록한 카드로 자동 결제돼요. 언제든 마이 페이지에서 해지할 수 있고, 해지하면 다음 결제일부터 결제되지 않아요.`
        : `이번 결제는 ${plan.intervalLabel} 이용료 ${plan.priceLabel} 1회 결제예요. 자동으로 다시 결제되지 않고, 기간이 끝나기 전에 안내해 드릴게요.`,
      `결제 후 7일 이내이고 구독 기능(담아두기·감상일기·공지${FeatureFlags.OPEN_CHAT ? "·오픈채팅" : ""})을 쓰지 않았다면 전액 환불받을 수 있어요.`,
      plan.isYearly
        ? "연간 구독을 중간에 해지하면 쓴 기간만큼을 뺀 금액을 환불 규정에 따라 돌려드려요."
        : "월간 구독은 이미 시작된 달의 요금은 환불되지 않아요(첫 결제 7일 이내 미사용 제외).",
      "가격이 바뀌거나 무료 혜택이 유료로 바뀔 때는 미리 알려드리고 다시 동의를 받아요.",
    ];
  }
}
