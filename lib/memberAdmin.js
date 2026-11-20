// 관리자 페이지 > 회원 관리 — 화면(브라우저)과 서버가 함께 쓰는 값·규칙.
//   MemberRecord   — 회원 한 명(로그인 정보·구독·활동·정지 상태). 불변
//   MemberFilter   — 목록 필터 종류(전체·구독자·일반 회원·운영진·정지)
//   MemberSort     — 정렬(가입 최신·최근 로그인·이름)
//   MemberQuery    — 검색어·필터·정렬·쪽 → 보여 줄 회원들. 불변(바꾸면 새 인스턴스)
//   MemberStats    — 위쪽 숫자(전체·구독자·이번 달 가입·정지)
//   SuspendDraft   — 정지 입력(사유 + 댓글 숨기기). 불변
//   MemberAdminApi — 브라우저에서 /api/admin/members 부르기
// 실제 조회·정지는 서버 전용 lib/memberAdminServer.js(MemberAdminService)가 합니다.

export class MemberRecord {
  constructor(data) {
    Object.assign(this, {
      id: data.id,
      email: data.email || "",
      name: data.name || "",
      providers: Object.freeze([...(data.providers || [])]),
      joinedAt: data.joinedAt || null,
      lastSignInAt: data.lastSignInAt || null,
      isSuspended: Boolean(data.isSuspended),
      suspendedAt: data.suspendedAt || null,
      suspendReason: data.suspendReason || "",
      subscription: data.subscription ? Object.freeze({ ...data.subscription }) : null, // { planCode, status, periodEnd, startedAt, lastPaidAt, cancelAtPeriodEnd, cardLabel }
      roles: Object.freeze([...(data.roles || [])]), // [{ channelName, role }]
      commentCount: Number(data.commentCount) || 0,
      reportedCount: Number(data.reportedCount) || 0,
    });
    Object.freeze(this);
  }

  static #PROVIDER_LABELS = { email: "이메일", google: "구글", kakao: "카카오", apple: "애플" };
  static #PLAN_LABELS = { membership_monthly: "월간", membership_yearly: "연간" };
  static #STATUS_LABELS = { trialing: "체험 중", active: "이용 중", past_due: "결제 실패", canceled: "해지", pending: "결제 대기" };

  get displayName() {
    return this.name || this.email.split("@")[0] || "회원";
  }

  get providerLabel() {
    return this.providers.map((p) => MemberRecord.#PROVIDER_LABELS[p] || p).join("·") || "이메일";
  }

  /** 구독이 지금 유효한지(체험·이용 중이고 기간이 남음). DB의 is_paid_member와 같은 규칙. */
  get isSubscriber() {
    const s = this.subscription;
    if (!s || !["trialing", "active"].includes(s.status)) return false;
    return !s.periodEnd || new Date(s.periodEnd) > new Date();
  }

  get isStaff() {
    return this.roles.length > 0;
  }

  get subscriptionLabel() {
    const s = this.subscription;
    if (!s) return "없음";
    const plan = MemberRecord.#PLAN_LABELS[s.planCode] || s.planCode;
    const status =
      s.cancelAtPeriodEnd && this.isSubscriber ? "해지 예약" : s.autoRenew === false && this.isSubscriber ? "1회 결제" : MemberRecord.#STATUS_LABELS[s.status] || s.status;
    return `${plan} · ${status}`;
  }

  /** 다음 결제일(자동결제가 살아 있을 때) / 이용 종료일(해지 예약·해지) */
  get nextBillingAt() {
    const s = this.subscription;
    return s && this.isSubscriber && s.autoRenew !== false && !s.cancelAtPeriodEnd ? s.periodEnd : null;
  }

  get endsAt() {
    const s = this.subscription;
    return s && (s.autoRenew === false || s.cancelAtPeriodEnd || !this.isSubscriber) ? s.periodEnd : null;
  }

  get tierLabel() {
    if (this.isSuspended) return "정지";
    if (this.isStaff) return "운영진";
    return this.isSubscriber ? "구독자" : "회원";
  }

  get roleLabel() {
    return this.roles.map((r) => `${r.channelName} ${r.role === "owner" ? "소유자" : "운영자"}`).join(", ");
  }

  /** 검색 — 이름·이메일에 글자가 들어 있으면. */
  matches(text) {
    const q = String(text || "").trim().toLowerCase();
    if (!q) return true;
    return this.email.toLowerCase().includes(q) || this.displayName.toLowerCase().includes(q);
  }

  toJSON() {
    const { id, email, name, providers, joinedAt, lastSignInAt, isSuspended, suspendedAt, suspendReason, subscription, roles, commentCount, reportedCount } = this;
    return { id, email, name, providers, joinedAt, lastSignInAt, isSuspended, suspendedAt, suspendReason, subscription, roles, commentCount, reportedCount };
  }

  /** "2026.11.20" — 없으면 "—". */
  static date(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }

  /** "방금 전 · 3시간 전 · 5일 전 · 2026.10.02" */
  static ago(value) {
    if (!value) return "기록 없음";
    const seconds = (Date.now() - new Date(value).getTime()) / 1000;
    if (seconds < 3600) return "1시간 안";
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}일 전`;
    return MemberRecord.date(value);
  }
}

export class MemberFilter {
  constructor(key, label, test) {
    this.key = key;
    this.label = label;
    this.test = test;
    Object.freeze(this);
  }

  static ALL = Object.freeze([
    new MemberFilter("all", "전체", () => true),
    new MemberFilter("subscriber", "구독자", (m) => m.isSubscriber && !m.isSuspended),
    new MemberFilter("member", "일반 회원", (m) => !m.isSubscriber && !m.isStaff && !m.isSuspended),
    new MemberFilter("staff", "운영진", (m) => m.isStaff),
    new MemberFilter("reported", "신고받음", (m) => m.reportedCount > 0),
    new MemberFilter("suspended", "정지", (m) => m.isSuspended),
  ]);

  static find(key) {
    return MemberFilter.ALL.find((f) => f.key === key) || MemberFilter.ALL[0];
  }
}

export class MemberSort {
  constructor(key, label, compare) {
    this.key = key;
    this.label = label;
    this.compare = compare;
    Object.freeze(this);
  }

  static #time = (v) => (v ? new Date(v).getTime() : 0);

  static ALL = Object.freeze([
    new MemberSort("joined", "가입 최신순", (a, b) => MemberSort.#time(b.joinedAt) - MemberSort.#time(a.joinedAt)),
    new MemberSort("lastSignIn", "최근 로그인순", (a, b) => MemberSort.#time(b.lastSignInAt) - MemberSort.#time(a.lastSignInAt)),
    new MemberSort("name", "이름순", (a, b) => a.displayName.localeCompare(b.displayName, "ko")),
  ]);

  static find(key) {
    return MemberSort.ALL.find((s) => s.key === key) || MemberSort.ALL[0];
  }
}

export class MemberQuery {
  static PAGE_SIZE = 30;

  constructor({ text = "", filter = "all", sort = "joined", page = 1 } = {}) {
    this.text = text;
    this.filter = filter;
    this.sort = sort;
    this.page = Math.max(1, page);
    Object.freeze(this);
  }

  /** 검색·필터·정렬을 바꾸면 첫 쪽으로. */
  with(patch) {
    const resetsPage = ["text", "filter", "sort"].some((k) => k in patch);
    return new MemberQuery({ ...this, ...(resetsPage ? { page: 1 } : {}), ...patch });
  }

  /** → { rows, total, pageCount, page } */
  apply(members) {
    const filter = MemberFilter.find(this.filter);
    const sort = MemberSort.find(this.sort);
    const matched = members.filter((m) => filter.test(m) && m.matches(this.text)).sort(sort.compare);
    const pageCount = Math.max(1, Math.ceil(matched.length / MemberQuery.PAGE_SIZE));
    const page = Math.min(this.page, pageCount);
    const start = (page - 1) * MemberQuery.PAGE_SIZE;
    return { rows: matched.slice(start, start + MemberQuery.PAGE_SIZE), total: matched.length, pageCount, page };
  }

  /** 필터별 인원(필터 버튼 옆 숫자). */
  static countBy(members) {
    return Object.fromEntries(MemberFilter.ALL.map((f) => [f.key, members.filter(f.test).length]));
  }
}

export class MemberStats {
  constructor(members, now = new Date()) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const weekAgo = now.getTime() - 7 * 86400 * 1000;
    this.total = members.length;
    this.subscribers = members.filter((m) => m.isSubscriber).length;
    this.joinedThisMonth = members.filter((m) => m.joinedAt && new Date(m.joinedAt).getTime() >= monthStart).length;
    this.activeThisWeek = members.filter((m) => m.lastSignInAt && new Date(m.lastSignInAt).getTime() >= weekAgo).length;
    this.suspended = members.filter((m) => m.isSuspended).length;
    Object.freeze(this);
  }
}

export class SuspendDraft {
  static REASON_MAX = 200;

  constructor({ reason = "", hideComments = true } = {}) {
    this.reason = String(reason).slice(0, SuspendDraft.REASON_MAX);
    this.hideComments = Boolean(hideComments);
    Object.freeze(this);
  }

  with(patch) {
    return new SuspendDraft({ ...this, ...patch });
  }

  get isReady() {
    return this.reason.trim().length > 0;
  }
}

/** 브라우저 → 관리자 API. 결과는 { ok, ... } | { ok: false, message }. */
export class MemberAdminApi {
  static BASE = "/api/admin/members";

  static async #call(url, init) {
    try {
      const response = await fetch(url, { cache: "no-store", ...init });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok) return body;
      return { ok: false, message: body.message || "불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." };
    } catch {
      return { ok: false, message: "연결이 끊겼어요. 잠시 뒤 다시 시도해 주세요." };
    }
  }

  /** → { ok, members: MemberRecord[] } */
  static async list() {
    const body = await MemberAdminApi.#call(MemberAdminApi.BASE);
    return body.ok ? { ok: true, members: body.members.map((m) => new MemberRecord(m)) } : body;
  }

  /** → { ok, member: MemberRecord, note? } */
  static async suspend(id, draft) {
    const body = await MemberAdminApi.#call(`${MemberAdminApi.BASE}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suspend", reason: draft.reason.trim(), hideComments: draft.hideComments }),
    });
    return body.ok ? { ...body, member: new MemberRecord(body.member) } : body;
  }

  /** → { ok, payments: PaymentRecord[] } */
  static async payments(id) {
    const body = await MemberAdminApi.#call(`${MemberAdminApi.BASE}/${id}/payments`);
    if (!body.ok) return body;
    const { PaymentRecord } = await import("@/lib/billing");
    return { ok: true, payments: body.payments.map((p) => new PaymentRecord(p)) };
  }

  /** 환불 — amount를 비우면 전액. */
  static refund(paymentId, { amount, reason }) {
    return MemberAdminApi.#call(`/api/admin/payments/${paymentId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, reason }),
    });
  }

  static async unsuspend(id) {
    const body = await MemberAdminApi.#call(`${MemberAdminApi.BASE}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unsuspend" }),
    });
    return body.ok ? { ...body, member: new MemberRecord(body.member) } : body;
  }
}
