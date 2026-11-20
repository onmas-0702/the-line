// 서버 전용 — 관리자 페이지의 회원 조회·정지. SUPABASE_SERVICE_ROLE_KEY(모든 회원을 읽는 서버 키)를 쓰므로
// 라우트 핸들러·서버 컴포넌트에서만 import하세요(브라우저에 절대 노출 금지).
//   AdminGuard          — 지금 요청한 사람이 관리자(운영사 채널 소유자)인지
//   MemberAdminService  — 회원 목록 모으기(로그인 정보 + 프로필 + 구독 + 운영 역할 + 댓글·신고 수), 정지·해제
// 정지는 Supabase 로그인 차단(ban)입니다. 차단되면 새로 로그인하거나 로그인을 이어 갈 수 없고,
// 이미 열린 화면도 길어야 1시간 안에 로그아웃됩니다.

import { createClient } from "@supabase/supabase-js";
import { AccessPolicy } from "@/lib/access";
import { MemberRecord } from "@/lib/memberAdmin";
import { SupabaseConfig } from "@/lib/supabaseClient";
import { ServerViewer } from "@/lib/supabaseServer";

class ServiceClient {
  static create() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!SupabaseConfig.isConfigured || !key) return null;
    return createClient(SupabaseConfig.URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
}

export class AdminGuard {
  /** 관리자 확인 → { viewer, allowed, reason }. 관리자는 운영사(플랫폼) 채널의 소유자입니다. */
  static async check() {
    const viewer = await ServerViewer.current();
    if (!viewer.isSignedIn) return { viewer, allowed: false, reason: "signed-out" };
    const service = ServiceClient.create();
    if (!service) return { viewer, allowed: false, reason: "not-configured" };
    const { data } = await service.from("channels").select("id, is_platform").eq("is_platform", true).limit(1);
    const platform = data?.[0] ? { id: data[0].id, isPlatform: true } : null;
    return { viewer, allowed: AccessPolicy.canAdministerPlatform(viewer, platform), reason: "not-admin" };
  }
}

export class MemberAdminService {
  static #BAN_FOREVER = "876000h"; // 100년 — 사실상 무기한(해제는 unsuspend)
  static #PAGE = 1000;

  constructor(client = ServiceClient.create()) {
    this.client = client;
  }

  get configured() {
    return Boolean(this.client);
  }

  async #allUsers() {
    const users = [];
    for (let page = 1; page < 100; page++) {
      const { data, error } = await this.client.auth.admin.listUsers({ page, perPage: MemberAdminService.#PAGE });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < MemberAdminService.#PAGE) break;
    }
    return users;
  }

  /** 표가 아직 없어도(마이그레이션 전) 빈 목록으로. */
  async #rows(table, columns, build = (q) => q) {
    const { data, error } = await build(this.client.from(table).select(columns)).limit(100000);
    return error ? [] : data || [];
  }

  static #record(user, extra) {
    const meta = user.app_metadata || {};
    const bannedUntil = user.banned_until ? new Date(user.banned_until) : null;
    return new MemberRecord({
      id: user.id,
      email: user.email,
      name: extra.name,
      providers: meta.providers || (meta.provider ? [meta.provider] : []),
      joinedAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      isSuspended: Boolean(bannedUntil && bannedUntil > new Date()),
      suspendedAt: meta.suspended_at || null,
      suspendReason: meta.suspend_reason || "",
      subscription: extra.subscription,
      roles: extra.roles,
      commentCount: extra.commentCount,
      reportedCount: extra.reportedCount,
    });
  }

  /** 모든 회원 → MemberRecord[] */
  async list() {
    const [users, profiles, subs, members, comments, reports] = await Promise.all([
      this.#allUsers(),
      this.#rows("profiles", "id, display_name"),
      this.#rows("member_subscriptions", "*"),
      this.#rows("channel_members", "user_id, role, channel:channels(name)"),
      this.#rows("comments", "user_id", (q) => q.is("deleted_at", null)),
      this.#rows("comment_reports", "comment:comments(user_id)", (q) => q.eq("status", "open")),
    ]);
    const nameOf = new Map(profiles.map((p) => [p.id, p.display_name]));
    const subOf = new Map(
      subs.map((s) => [
        s.user_id,
        {
          planCode: s.plan_code,
          status: s.status,
          periodEnd: s.current_period_end,
          startedAt: s.started_at || null,
          lastPaidAt: s.last_paid_at || null,
          cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
          cardLabel: s.card_label || "",
          autoRenew: s.auto_renew !== false,
        },
      ])
    );
    const rolesOf = new Map();
    for (const m of members) rolesOf.set(m.user_id, [...(rolesOf.get(m.user_id) || []), { channelName: m.channel?.name || "채널", role: m.role }]);
    const count = (rows, pick) => rows.reduce((map, r) => map.set(pick(r), (map.get(pick(r)) || 0) + 1), new Map());
    const commentsOf = count(comments, (r) => r.user_id);
    const reportsOf = count(reports, (r) => r.comment?.user_id);

    return users.map((user) =>
      MemberAdminService.#record(user, {
        name: nameOf.get(user.id) || user.user_metadata?.name || "",
        subscription: subOf.get(user.id) || null,
        roles: rolesOf.get(user.id) || [],
        commentCount: commentsOf.get(user.id) || 0,
        reportedCount: reportsOf.get(user.id) || 0,
      })
    );
  }

  async #one(id) {
    const all = await this.list();
    return all.find((m) => m.id === id) || null;
  }

  /** 정지 — 로그인 차단 + 사유 기록, 원하면 그 회원의 댓글을 모두 숨김(0026의 hidden_at). → { member, note } */
  async suspend(id, { reason, hideComments, byUserId }) {
    if (id === byUserId) throw new Error("self");
    const { data: found, error: findError } = await this.client.auth.admin.getUserById(id);
    if (findError || !found?.user) throw new Error("not_found");
    const owner = await this.client.from("channel_members").select("user_id").eq("user_id", id).eq("role", "owner").limit(1);
    if (owner.data?.length) throw new Error("owner");

    const { error } = await this.client.auth.admin.updateUserById(id, {
      ban_duration: MemberAdminService.#BAN_FOREVER,
      app_metadata: { ...(found.user.app_metadata || {}), suspended_at: new Date().toISOString(), suspend_reason: String(reason).slice(0, 200), suspended_by: byUserId },
    });
    if (error) throw error;

    let note = "";
    if (hideComments) {
      const hidden = await this.client
        .from("comments")
        .update({ hidden_at: new Date().toISOString() })
        .eq("user_id", id)
        .is("deleted_at", null)
        .is("hidden_at", null);
      if (hidden.error) note = "댓글 숨기기는 신고·차단 마이그레이션(0026)을 실행한 뒤에 할 수 있어요.";
    }
    return { member: await this.#one(id), note };
  }

  /** 정지 풀기 — 로그인 차단 해제(숨긴 댓글은 그대로 둡니다. 필요하면 스튜디오 > 신고에서 다시 보이게). */
  async unsuspend(id) {
    const { data: found, error: findError } = await this.client.auth.admin.getUserById(id);
    if (findError || !found?.user) throw new Error("not_found");
    const meta = { ...(found.user.app_metadata || {}) };
    delete meta.suspended_at;
    delete meta.suspend_reason;
    delete meta.suspended_by;
    const { error } = await this.client.auth.admin.updateUserById(id, { ban_duration: "none", app_metadata: meta });
    if (error) throw error;
    return { member: await this.#one(id), note: "" };
  }

  static messageFor(error) {
    const text = String(error?.message || "");
    if (text === "self") return "내 계정은 정지할 수 없어요.";
    if (text === "owner") return "채널 소유자는 정지할 수 없어요. 채널을 먼저 정리해 주세요.";
    if (text === "not_found") return "회원을 찾지 못했어요. 이미 탈퇴했을 수 있어요.";
    return "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  }
}
