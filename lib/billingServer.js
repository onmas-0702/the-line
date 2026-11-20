// 서버 전용 — 멤버십 정기결제 처리(0027). 서버 키(SUPABASE_SERVICE_ROLE_KEY)로 결제 표를 읽고 씁니다.
//   BillingService — 월간: 카드 등록 창 준비(주문 만들기) → 카드 등록 결과 저장(결제 안 함) → 가입 확정(첫 결제) →
//                          자동갱신(크론) → 해지 예약·취소
//                    연간: 일반결제창 준비 → 결과 받는 곳에서 승인까지(1회 결제, 자동갱신 없음 — 1년 뒤 끝남)
//                    공통: 환불(관리자 — 결제한 상점으로)
// 온마스에서 검증한 순서: 카드 등록 결과를 받는 곳에서는 결제하지 않고, 구독 화면이 "가입 확정"을 한 번 부를 때만
// 결제합니다. 같은 주문이 두 번 결제되지 않게, 주문을 "processing"으로 바꾸는 데 성공한 요청만 결제합니다.

import { createClient } from "@supabase/supabase-js";
import { BillingOrderId, MembershipSummary, PaymentRecord, SubscriptionPeriod } from "@/lib/billing";
import { InicisApi, InicisBillingKey, InicisConfig, InicisOneTimePay } from "@/lib/inicis";
import { Plan } from "@/lib/subscription";
import { SupabaseConfig } from "@/lib/supabaseClient";

export class BillingService {
  static MAX_FAILED_ATTEMPTS = 3; // 자동갱신이 사흘 연속 실패하면 해지
  static SERVER_IP = process.env.INICIS_SERVER_IP || "127.0.0.1";
  /** 연락처 — 숫자만 남겨 9~11자리면 사용(자동결제 승인에 필요). */
  static tel(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 11 ? digits : "";
  }

  constructor() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    this.client = SupabaseConfig.isConfigured && key ? createClient(SupabaseConfig.URL, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  get isReady() {
    return Boolean(this.client) && InicisConfig.isConfigured;
  }

  static siteUrl(origin) {
    return (process.env.NEXT_PUBLIC_SITE_URL || origin || "").replace(/\/$/, "");
  }

  async #plan(code) {
    const { data } = await this.client.from("plans").select("*").eq("code", code).maybeSingle();
    return data ? Plan.fromRow(data) : Plan.defaults().find((p) => p.code === code) || null;
  }

  async #subscription(userId) {
    const { data } = await this.client.from("member_subscriptions").select("*").eq("user_id", userId).maybeSingle();
    return data || null;
  }

  async #buyer(userId) {
    const { data } = await this.client.auth.admin.getUserById(userId);
    const user = data?.user;
    const { data: profile } = await this.client.from("profiles").select("display_name").eq("id", userId).maybeSingle();
    return {
      name: (profile?.display_name || user?.user_metadata?.name || "회원").slice(0, 30),
      email: user?.email || "",
    };
  }

  // ───────────────────────── 1. 결제창 준비 ─────────────────────────

  /** 월간 → { ok, mode: "billing", oid, action, fields } · 연간 → { ok, mode: "onetime", oid, sdkUrl, jqueryUrl, params }
   *  | { ok: false, message } */
  async startCheckout({ userId, planCode, buyerTel, origin, isMobile = false }) {
    if (!this.client) return { ok: false, message: "카드 결제는 준비 중이에요. 정식 오픈 때 알려드릴게요." };
    const plan = await this.#plan(planCode);
    if (!plan) return { ok: false, message: "요금제를 찾지 못했어요." };
    const current = new MembershipSummary(await this.#subscription(userId));
    if (current.isActive) return { ok: false, message: "이미 멤버십을 이용 중이에요. 마이 페이지에서 확인해 주세요." };
    if (plan.isYearly) return this.#startOneTime({ userId, plan, origin, isMobile });

    if (!InicisConfig.isConfigured) return { ok: false, message: "월간 결제는 준비 중이에요. 정식 오픈 때 알려드릴게요." };
    const tel = BillingService.tel(buyerTel);
    if (!tel) return { ok: false, message: "연락처를 정확히 입력해 주세요. 자동 결제 승인에 필요해요." };

    const oid = BillingOrderId.first();
    const { error } = await this.client
      .from("billing_checkouts")
      .insert({ oid, user_id: userId, plan_code: plan.code, amount: plan.priceKrw, kind: "first", buyer_tel: tel });
    if (error) return { ok: false, message: "결제를 준비하지 못했어요. 잠시 뒤 다시 시도해 주세요." };

    const buyer = await this.#buyer(userId);
    const site = BillingService.siteUrl(origin);
    return {
      ok: true,
      mode: "billing",
      oid,
      action: InicisConfig.BILLING_KEY_URL,
      fields: InicisBillingKey.formFields({
        oid,
        price: plan.priceKrw,
        goodName: BillingService.goodName(plan),
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        buyerTel: tel,
        returnUrl: `${site}/api/billing/inicis/return`,
      }),
    };
  }

  /** 연간 1회 결제 — 일반결제창에 넘길 값. 결제창은 누르기 전에 미리 준비해 둬야 팝업이 막히지 않습니다. */
  async #startOneTime({ userId, plan, origin, isMobile }) {
    if (!InicisConfig.isOneTimeConfigured) return { ok: false, message: "연간 결제는 준비 중이에요. 정식 오픈 때 알려드릴게요." };
    const oid = BillingOrderId.first();
    const { error } = await this.client
      .from("billing_checkouts")
      .insert({ oid, user_id: userId, plan_code: plan.code, amount: plan.priceKrw, kind: "onetime" });
    if (error) return { ok: false, message: "결제를 준비하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
    const buyer = await this.#buyer(userId);
    const site = BillingService.siteUrl(origin);
    return {
      ok: true,
      mode: "onetime",
      oid,
      sdkUrl: InicisConfig.PAY_SDK_URL,
      jqueryUrl: InicisConfig.JQUERY_URL,
      params: InicisOneTimePay.requestParams({
        oid,
        amount: plan.priceKrw,
        goodName: BillingService.goodName(plan),
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        nextUrl: `${site}/api/billing/inicis/pay-return`,
        closeUrl: `${site}/pricing`,
        deviceType: isMobile ? "MOBILE" : "WEB",
      }),
    };
  }

  /** 연간 1회 결제 결과(P_NEXT_URL로 온 값) → 승인 → 1년 이용 시작. → { ok, message } */
  async completeOneTime(fields, { clientIp } = {}) {
    if (!this.client || !InicisConfig.isOneTimeConfigured) return { ok: false, message: "결제가 준비되지 않았어요." };
    const oid = fields.P_OID || "";
    const { data } = await this.client
      .from("billing_checkouts")
      .update({ status: "processing" })
      .eq("oid", oid)
      .eq("kind", "onetime")
      .eq("status", "pending")
      .select("*");
    const checkout = data?.[0];
    if (!checkout) return { ok: false, message: "이미 처리됐거나 주문을 찾지 못했어요." };
    const fail = async (message) => {
      await this.client.from("billing_checkouts").update({ status: "failed", message, finished_at: new Date().toISOString() }).eq("oid", oid);
      return { ok: false, message };
    };
    if (fields.P_STATUS !== "00") return fail(fields.P_RMESG1 || fields.P_MESG || "결제가 취소됐어요.");
    if (Number(fields.P_AMT) !== checkout.amount) return fail("결제 금액이 맞지 않아요.");

    const current = new MembershipSummary(await this.#subscription(checkout.user_id));
    if (current.isActive) return fail("이미 멤버십을 이용 중이라 결제하지 않았어요. 카드는 청구되지 않았어요.");

    const approved = await InicisOneTimePay.approve({ idcName: fields.P_IDCNAME, authTid: fields.P_AUTH_TID || fields.P_TID, amount: checkout.amount });
    if (!approved.ok) return fail(approved.message);

    try {
      const plan = await this.#plan(checkout.plan_code);
      const now = new Date();
      const periodEnd = SubscriptionPeriod.next(now, plan.interval);
      const { error: payError } = await this.client.from("payments").insert({
        user_id: checkout.user_id,
        plan_code: plan.code,
        kind: "onetime",
        method: "onetime",
        amount: checkout.amount,
        status: "paid",
        oid,
        tid: approved.tid,
        card_label: approved.cardLabel,
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
        paid_at: now.toISOString(),
      });
      if (payError) throw payError;
      const { error: subError } = await this.client.from("member_subscriptions").upsert(
        {
          user_id: checkout.user_id,
          plan_code: plan.code,
          status: "active",
          provider: "inicis",
          current_period_end: periodEnd.toISOString(),
          started_at: now.toISOString(),
          last_paid_at: now.toISOString(),
          auto_renew: false,
          cancel_at_period_end: false,
          canceled_at: null,
          card_label: approved.cardLabel,
          failed_attempts: 0,
        },
        { onConflict: "user_id" }
      );
      if (subError) throw subError;
      await this.client.from("billing_checkouts").update({ status: "paid", finished_at: now.toISOString() }).eq("oid", oid);
      return { ok: true, message: "" };
    } catch {
      // 승인은 됐는데 저장이 실패 — 결제를 되돌립니다(망취소).
      await InicisOneTimePay.netCancel({ idcName: fields.P_IDCNAME, authTid: fields.P_AUTH_TID || fields.P_TID, amount: checkout.amount, oid });
      return fail("결제를 저장하지 못해 결제를 취소했어요. 잠시 뒤 다시 시도해 주세요.");
    }
  }

  static goodName(plan) {
    return `더 라인 ${plan.isYearly ? "연간" : "월간"} 멤버십`;
  }

  // ───────────────────────── 2. 카드 등록 결과(결제 안 함) ─────────────────────────

  /** 이니시스가 보낸 카드 등록 결과(폼 본문 그대로) → 확인 후 주문에 빌링키만 저장. → { ok, oid, message } */
  async saveBillingKey(rawBody) {
    if (!this.isReady) return { ok: false, oid: "", message: "결제가 준비되지 않았어요." };
    const fields = InicisBillingKey.parseBody(rawBody);
    const result = InicisBillingKey.verify(fields);
    if (!result.oid) return { ok: false, oid: "", message: "주문번호가 없어요." };
    if (!result.ok) {
      await this.client
        .from("billing_checkouts")
        .update({ status: "failed", message: result.message, finished_at: new Date().toISOString() })
        .eq("oid", result.oid)
        .eq("status", "pending");
      return result;
    }
    const { data } = await this.client
      .from("billing_checkouts")
      .update({ status: "billkey_issued", billing_key: result.billingKey, card_label: result.cardLabel })
      .eq("oid", result.oid)
      .eq("status", "pending")
      .select("oid");
    if (!data?.length) return { ok: false, oid: result.oid, message: "이미 처리됐거나 주문을 찾지 못했어요." };
    return { ok: true, oid: result.oid, message: "" };
  }

  // ───────────────────────── 3. 가입 확정(첫 결제) ─────────────────────────

  /** 본인의 "카드 등록됨" 주문을 한 번만 결제합니다. → { ok, message } */
  async confirm({ userId, oid, origin, clientIp }) {
    if (!this.isReady) return { ok: false, message: "결제가 준비되지 않았어요." };
    const { data } = await this.client
      .from("billing_checkouts")
      .update({ status: "processing" })
      .eq("oid", oid)
      .eq("user_id", userId)
      .eq("status", "billkey_issued")
      .select("*");
    const checkout = data?.[0];
    if (!checkout) return { ok: false, message: "진행할 결제가 없어요. 이미 처리됐을 수 있어요." };

    await this.client.from("billing_keys").upsert({
      user_id: userId,
      billing_key: checkout.billing_key,
      card_label: checkout.card_label,
      buyer_tel: checkout.buyer_tel,
      updated_at: new Date().toISOString(),
    });
    const result = await this.#chargeCheckout(checkout, {
      billingKey: checkout.billing_key,
      cardLabel: checkout.card_label,
      buyerTel: checkout.buyer_tel,
      siteUrl: BillingService.siteUrl(origin),
      clientIp,
    });
    // 주문에 남은 빌링키는 지웁니다(보관은 billing_keys 한 곳에서만).
    await this.client.from("billing_checkouts").update({ billing_key: null }).eq("oid", oid);
    return result;
  }

  /** 주문을 "processing"으로 바꾸는 데 성공하면 그 주문(자동갱신용). */
  async #claim(oid) {
    const { data } = await this.client
      .from("billing_checkouts")
      .update({ status: "processing" })
      .eq("oid", oid)
      .eq("status", "pending")
      .select("*");
    return data?.[0] || null;
  }

  async #chargeCheckout(checkout, { billingKey, cardLabel, buyerTel, siteUrl, clientIp }) {
    const plan = await this.#plan(checkout.plan_code);
    const buyer = await this.#buyer(checkout.user_id);
    const sub = await this.#subscription(checkout.user_id);
    const isRenewal = checkout.kind === "renewal";
    const periodStart = isRenewal && sub?.current_period_end ? new Date(sub.current_period_end) : new Date();
    const periodEnd = SubscriptionPeriod.next(periodStart, plan.interval);

    const charged = await InicisApi.charge({
      oid: checkout.oid,
      price: checkout.amount,
      billingKey,
      goodName: BillingService.goodName(plan),
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      buyerTel,
      siteUrl: siteUrl || BillingService.siteUrl(""),
      clientIp: clientIp || BillingService.SERVER_IP,
    });
    const now = new Date().toISOString();

    await this.client.from("payments").insert({
      user_id: checkout.user_id,
      plan_code: plan.code,
      kind: checkout.kind,
      amount: checkout.amount,
      status: charged.ok ? "paid" : "failed",
      oid: checkout.oid,
      tid: charged.tid || null,
      card_label: cardLabel,
      message: charged.ok ? null : charged.message,
      period_start: charged.ok ? periodStart.toISOString() : null,
      period_end: charged.ok ? periodEnd.toISOString() : null,
      paid_at: charged.ok ? now : null,
    });
    await this.client
      .from("billing_checkouts")
      .update({ status: charged.ok ? "paid" : "failed", message: charged.ok ? null : charged.message, finished_at: now })
      .eq("oid", checkout.oid);

    if (charged.ok) {
      await this.client.from("member_subscriptions").upsert(
        {
          user_id: checkout.user_id,
          plan_code: plan.code,
          status: "active",
          provider: "inicis",
          current_period_end: periodEnd.toISOString(),
          started_at: isRenewal ? sub?.started_at || now : now,
          last_paid_at: now,
          auto_renew: true,
          cancel_at_period_end: false,
          canceled_at: null,
          card_label: cardLabel,
          failed_attempts: 0,
        },
        { onConflict: "user_id" }
      );
      return { ok: true, message: "" };
    }

    if (isRenewal && sub) {
      const attempts = (sub.failed_attempts || 0) + 1;
      await this.client
        .from("member_subscriptions")
        .update({ status: attempts >= BillingService.MAX_FAILED_ATTEMPTS ? "canceled" : "past_due", failed_attempts: attempts })
        .eq("user_id", checkout.user_id);
    }
    return { ok: false, message: charged.message || "결제에 실패했어요." };
  }

  // ───────────────────────── 4. 자동갱신(매일 크론) ─────────────────────────

  /** 결제일이 지난 구독을 결제하거나(자동갱신) 해지 예약을 마무리합니다. → { charged, failed, ended } */
  async renewDue({ now = new Date() } = {}) {
    const report = { charged: 0, failed: 0, ended: 0 };
    if (!this.client) return report;
    const { data: due } = await this.client
      .from("member_subscriptions")
      .select("*")
      .in("status", ["active", "past_due"])
      .lte("current_period_end", now.toISOString())
      .limit(500);

    for (const sub of due || []) {
      // 해지 예약·연간 1회 결제(auto_renew=false)·재시도 다 실패 → 기간이 끝났으니 종료
      if (sub.cancel_at_period_end || sub.auto_renew === false || (sub.failed_attempts || 0) >= BillingService.MAX_FAILED_ATTEMPTS) {
        await this.client.from("member_subscriptions").update({ status: "canceled" }).eq("user_id", sub.user_id);
        report.ended += 1;
        continue;
      }
      if (!InicisConfig.isConfigured) continue; // 월간 정기결제 키가 없으면 결제는 건너뜀
      const { data: key } = await this.client.from("billing_keys").select("billing_key, card_label, buyer_tel").eq("user_id", sub.user_id).maybeSingle();
      if (!key) {
        await this.client.from("member_subscriptions").update({ status: "canceled" }).eq("user_id", sub.user_id);
        report.ended += 1;
        continue;
      }
      const plan = await this.#plan(sub.plan_code);
      const oid = BillingOrderId.renewal(sub.user_id, now);
      const { error } = await this.client
        .from("billing_checkouts")
        .insert({ oid, user_id: sub.user_id, plan_code: plan.code, amount: plan.priceKrw, kind: "renewal" });
      if (error) continue; // 오늘 이미 시도함
      const checkout = await this.#claim(oid);
      if (!checkout) continue;
      const result = await this.#chargeCheckout(checkout, {
        billingKey: key.billing_key,
        cardLabel: key.card_label,
        buyerTel: key.buyer_tel,
        siteUrl: "",
        clientIp: "",
      });
      if (result.ok) report.charged += 1;
      else report.failed += 1;
    }
    return report;
  }

  // ───────────────────────── 5. 해지 예약·취소 ─────────────────────────

  async cancel(userId) {
    const sub = new MembershipSummary(await this.#subscription(userId));
    if (!sub.canCancel) return { ok: false, message: "해지할 멤버십이 없어요." };
    await this.client
      .from("member_subscriptions")
      .update({ cancel_at_period_end: true, canceled_at: new Date().toISOString() })
      .eq("user_id", userId);
    return { ok: true, summary: new MembershipSummary(await this.#subscription(userId)).toJSON() };
  }

  async resume(userId) {
    const sub = new MembershipSummary(await this.#subscription(userId));
    if (!sub.canResume) return { ok: false, message: "다시 이어 갈 멤버십이 없어요." };
    await this.client.from("member_subscriptions").update({ cancel_at_period_end: false, canceled_at: null }).eq("user_id", userId);
    return { ok: true, summary: new MembershipSummary(await this.#subscription(userId)).toJSON() };
  }

  // ───────────────────────── 6. 관리자 — 결제 기록·환불 ─────────────────────────

  async paymentsFor(userId) {
    const { data } = await this.client.from("payments").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
    return (data || []).map((row) => new PaymentRecord(row));
  }

  /** 환불 — amount가 결제 금액보다 작으면 부분 환불. 마지막 결제를 전액 환불하면 멤버십도 바로 끝냅니다. */
  async refund(paymentId, { amount, reason, clientIp }) {
    if (!this.client) return { ok: false, message: "결제가 준비되지 않았어요." };
    const { data: row } = await this.client.from("payments").select("*").eq("id", paymentId).maybeSingle();
    const payment = row ? new PaymentRecord(row) : null;
    if (!payment?.canRefund) return { ok: false, message: "환불할 수 있는 결제가 아니에요." };
    const refundAmount = Math.min(payment.amount, Math.max(0, Math.round(Number(amount) || payment.amount)));
    const isFull = refundAmount >= payment.amount;
    const result = isFull
      ? await InicisApi.refund({ tid: payment.tid, reason, clientIp: clientIp || BillingService.SERVER_IP, method: payment.method })
      : await InicisApi.partialRefund({
          tid: payment.tid,
          amount: refundAmount,
          remaining: payment.amount - refundAmount,
          reason,
          clientIp: clientIp || BillingService.SERVER_IP,
          method: payment.method,
        });
    if (!result.ok) return result;

    const now = new Date().toISOString();
    await this.client
      .from("payments")
      .update({ status: isFull ? "refunded" : "partially_refunded", refunded_amount: refundAmount, refunded_at: now, message: reason || null })
      .eq("id", paymentId);
    // 환불하면 멤버십은 바로 끝냅니다(남은 기간 없음, 자동결제도 멈춤).
    await this.client
      .from("member_subscriptions")
      .update({ status: "canceled", current_period_end: now, cancel_at_period_end: true, canceled_at: now })
      .eq("user_id", row.user_id);
    return { ok: true };
  }
}
