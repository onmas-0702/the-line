// 댓글 신고·사용자 차단(0026) — 앱스토어·구글 플레이 심사 필수 항목.
//   ReportReason              — 신고 사유(스팸·욕설·혐오·음란·기타)
//   ReportDraft               — 신고 입력(사유 + 덧붙이는 말). 불변
//   ReportedComment           — 스튜디오 > 신고 탭의 한 줄: 신고된 댓글 하나와 그 신고들. 불변
//   CommentReportRepository   — 신고하기, 채널의 신고 목록, 처리(숨기기·문제없음)
//   BlockList                 — 내가 차단한 사람들(id 집합). 댓글 목록에서 빼는 데 씁니다. 불변
//   UserBlockRepository       — 차단·차단 풀기·내 차단 목록
// 누가 할 수 있는지는 AccessPolicy(canReportComment·canModerateComments), DB 규칙은 0026의 RLS.

import { SupabaseRepository } from "@/lib/supabaseRepository";

export class ReportReason {
  constructor(key, label) {
    this.key = key;
    this.label = label;
    Object.freeze(this);
  }

  static ALL = Object.freeze([
    new ReportReason("spam", "스팸·광고"),
    new ReportReason("abuse", "욕설·괴롭힘"),
    new ReportReason("hate", "혐오·차별"),
    new ReportReason("sexual", "음란·선정적"),
    new ReportReason("other", "기타"),
  ]);

  static labelOf(key) {
    return ReportReason.ALL.find((r) => r.key === key)?.label || "기타";
  }
}

export class ReportDraft {
  static DETAIL_MAX = 200;

  constructor({ reason = "", detail = "" } = {}) {
    this.reason = reason;
    this.detail = String(detail).slice(0, ReportDraft.DETAIL_MAX);
    Object.freeze(this);
  }

  with(patch) {
    return new ReportDraft({ ...this, ...patch });
  }

  get isReady() {
    return ReportReason.ALL.some((r) => r.key === this.reason);
  }
}

/** 신고된 댓글 하나 + 그 신고들(스튜디오 목록 한 줄). */
export class ReportedComment {
  constructor({ commentId, body, authorName, authorId, audioTitle, createdAt, isHidden, isDeleted, reports }) {
    Object.assign(this, { commentId, body, authorName, authorId, audioTitle, createdAt, isHidden, isDeleted });
    this.reports = Object.freeze([...reports]);
    Object.freeze(this);
  }

  get count() {
    return this.reports.length;
  }

  get openCount() {
    return this.reports.filter((r) => r.status === "open").length;
  }

  /** "스팸·광고 2 · 기타 1" */
  get reasonSummary() {
    const counts = new Map();
    for (const r of this.reports) counts.set(r.reason, (counts.get(r.reason) || 0) + 1);
    return [...counts].map(([key, n]) => `${ReportReason.labelOf(key)} ${n}`).join(" · ");
  }

  get details() {
    return this.reports.map((r) => r.detail).filter(Boolean);
  }

  get latestAt() {
    return this.reports.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), "");
  }

  /** 신고 행들(댓글 정보 포함) → 댓글별로 묶어 최근 신고 순으로. */
  static group(rows) {
    const byComment = new Map();
    for (const row of rows) {
      const c = row.comment;
      if (!c) continue;
      const entry = byComment.get(c.id) || {
        commentId: c.id,
        body: c.body,
        authorName: c.author?.display_name || "회원",
        authorId: c.user_id,
        audioTitle: c.audio?.title || "",
        createdAt: c.created_at,
        isHidden: Boolean(c.hidden_at),
        isDeleted: Boolean(c.deleted_at),
        reports: [],
      };
      entry.reports.push({ reason: row.reason, detail: row.detail || "", status: row.status, createdAt: row.created_at });
      byComment.set(c.id, entry);
    }
    return [...byComment.values()].map((e) => new ReportedComment(e)).sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
  }
}

export class CommentReportRepository extends SupabaseRepository {
  static TABLE = "comment_reports";
  static Status = Object.freeze({ OPEN: "open", HIDDEN: "hidden", DISMISSED: "dismissed" });
  static Action = Object.freeze({ HIDE: "hide", DISMISS: "dismiss" });

  /** 오류 → 한국어 안내. */
  static messageFor(error) {
    const text = `${error?.message || ""} ${error?.code || ""}`;
    if (error?.code === "23505") return "이미 신고한 댓글이에요.";
    if (/own_comment/.test(text)) return "내 댓글은 신고할 수 없어요.";
    if (/comment_not_found/.test(text)) return "이미 지워진 댓글이에요.";
    if (/not_allowed/.test(text)) return "신고를 처리할 권한이 없어요.";
    if (error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202" || /comment_reports|resolve_comment_reports/.test(text)) {
      return "신고 기능을 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.";
    }
    return "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  }

  async report({ commentId, reporterId, draft }) {
    if (!this.configured) return this.notConfigured();
    if (!draft.isReady) return SupabaseRepository.fail("신고 사유를 골라 주세요.");
    const { error } = await this.client.from(CommentReportRepository.TABLE).insert(
      // channel_id는 DB가 댓글에서 채웁니다(0026 트리거). 비워 둘 수 없는 칸이라 같은 값을 미리 넣어 둡니다.
      this.withChannel({ comment_id: commentId, reporter_id: reporterId, reason: draft.reason, detail: draft.detail.trim() || null })
    );
    if (error) return SupabaseRepository.fail(CommentReportRepository.messageFor(error));
    return SupabaseRepository.ok();
  }

  /** 채널의 신고 목록. status: "open"(처리 대기) | "hidden"(숨긴 댓글). → { items: ReportedComment[] } */
  async listFor(status = CommentReportRepository.Status.OPEN) {
    if (!this.configured) return this.notConfigured({ items: [] });
    const { data, error } = await this.scoped(
      this.client
        .from(CommentReportRepository.TABLE)
        .select(
          "reason, detail, status, created_at, comment:comments(id, body, user_id, created_at, hidden_at, deleted_at, author:profiles(display_name), audio:audios(title))"
        )
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(300)
    );
    if (error) return SupabaseRepository.fail(CommentReportRepository.messageFor(error), { items: [] });
    return SupabaseRepository.ok({ items: ReportedComment.group(data || []) });
  }

  /** 처리 — HIDE: 댓글 숨기기, DISMISS: 문제없음(숨겼던 댓글도 다시 보이기). */
  async resolve(commentId, action) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.rpc("resolve_comment_reports", { target_comment: commentId, action });
    if (error) return SupabaseRepository.fail(CommentReportRepository.messageFor(error));
    return SupabaseRepository.ok();
  }
}

/** 내가 차단한 사람들. 댓글 목록에서 그 사람들의 댓글을 뺍니다. */
export class BlockList {
  static EMPTY = new BlockList();

  constructor(ids = []) {
    this.ids = Object.freeze([...new Set(ids)]);
    Object.freeze(this);
  }

  has(userId) {
    return this.ids.includes(userId);
  }

  with(userId) {
    return this.has(userId) ? this : new BlockList([...this.ids, userId]);
  }

  without(userId) {
    return new BlockList(this.ids.filter((id) => id !== userId));
  }

  /** 차단한 사람의 댓글을 뺀 목록. */
  visible(comments) {
    return this.ids.length ? comments.filter((c) => !this.has(c.userId)) : comments;
  }
}

export class UserBlockRepository extends SupabaseRepository {
  static TABLE = "user_blocks";

  static messageFor(error) {
    if (error?.code === "23505") return "이미 차단한 사람이에요.";
    if (error?.code === "42P01" || error?.code === "PGRST205") return "차단 기능을 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.";
    return "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  }

  /** 내 차단 목록 → { blocks: [{ userId, name, createdAt }] }. 표가 아직 없으면 빈 목록. */
  async listMine(userId) {
    if (!this.configured || !userId) return SupabaseRepository.ok({ blocks: [] });
    const { data, error } = await this.client
      .from(UserBlockRepository.TABLE)
      .select("blocked_id, created_at, blocked:profiles(display_name)")
      .eq("blocker_id", userId)
      .order("created_at", { ascending: false });
    if (error) return SupabaseRepository.fail(UserBlockRepository.messageFor(error), { blocks: [] });
    return SupabaseRepository.ok({
      blocks: (data || []).map((row) => ({ userId: row.blocked_id, name: row.blocked?.display_name || "회원", createdAt: row.created_at })),
    });
  }

  /** 댓글 목록에 쓸 차단 집합. */
  async blockListFor(userId) {
    const result = await this.listMine(userId);
    return new BlockList(result.blocks.map((b) => b.userId));
  }

  async block(blockerId, blockedId) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.from(UserBlockRepository.TABLE).insert({ blocker_id: blockerId, blocked_id: blockedId });
    if (error && error.code !== "23505") return SupabaseRepository.fail(UserBlockRepository.messageFor(error));
    return SupabaseRepository.ok();
  }

  async unblock(blockerId, blockedId) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client
      .from(UserBlockRepository.TABLE)
      .delete()
      .eq("blocker_id", blockerId)
      .eq("blocked_id", blockedId);
    if (error) return SupabaseRepository.fail(UserBlockRepository.messageFor(error));
    return SupabaseRepository.ok();
  }
}
