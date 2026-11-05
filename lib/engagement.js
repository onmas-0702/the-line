// 콘텐츠에 대한 참여 — 한줄평·이모지 댓글, 좋아요·담아두기, 감상일기.
// 권한 판단은 AccessPolicy(lib/access.js), DB 규칙은 0016_engagement.sql의 RLS.
// 서버·클라이언트 양쪽에서 import할 수 있게 "use client"를 붙이지 않습니다.
// 모든 저장소는 SupabaseRepository를 상속해 { ok, reason, ... } 결과 객체를 돌려줍니다.

import { SupabaseRepository } from "@/lib/supabaseRepository";

// ─────────────────────────────────────────────
// 댓글(한줄평·이모지)
// ─────────────────────────────────────────────

export class CommentDraft {
  static MAX_LENGTH = 100;
  static QUICK_EMOJIS = Object.freeze(["🙏", "❤️", "😭", "👏", "🔥", "🌿", "✨", "🕊️"]);

  constructor(body = "") {
    this.body = String(body);
    Object.freeze(this);
  }

  get trimmed() {
    return this.body.trim();
  }

  get length() {
    return [...this.trimmed].length; // 이모지를 한 글자로 셉니다
  }

  /** 이모지 하나를 덧붙인 새 초안. */
  withEmoji(emoji) {
    const next = this.body ? `${this.body}${emoji}` : emoji;
    return new CommentDraft([...next].slice(0, CommentDraft.MAX_LENGTH).join(""));
  }

  validate() {
    if (!this.trimmed) return "한줄평이나 이모지를 남겨주세요.";
    if (this.length > CommentDraft.MAX_LENGTH) return `한줄평은 ${CommentDraft.MAX_LENGTH}자까지 쓸 수 있어요.`;
    return null;
  }
}

export class Comment {
  constructor({ id, audioId, userId, authorName, body, createdAt }) {
    Object.assign(this, { id, audioId, userId, authorName, body, createdAt });
    Object.freeze(this);
  }

  static fromRow(row) {
    return new Comment({
      id: row.id,
      audioId: row.audio_id,
      userId: row.user_id,
      authorName: row.author?.display_name || "회원",
      body: row.body,
      createdAt: row.created_at,
    });
  }

  /** "방금 전", "3분 전", "2일 전", 그보다 오래되면 날짜. */
  get relativeTime() {
    const seconds = Math.max(0, (Date.now() - new Date(this.createdAt).getTime()) / 1000);
    if (seconds < 60) return "방금 전";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}일 전`;
    return String(this.createdAt).slice(0, 10);
  }
}

export class CommentRepository extends SupabaseRepository {
  static TABLE = "comments";
  static PAGE_SIZE = 50;

  async listFor(audioId) {
    if (!this.configured) return this.notConfigured({ comments: [] });
    const { data, error } = await this.client
      .from(CommentRepository.TABLE)
      .select("id, audio_id, user_id, body, created_at, author:profiles(display_name)")
      .eq("audio_id", audioId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(CommentRepository.PAGE_SIZE);
    if (error) return SupabaseRepository.fail(error.message, { comments: [] });
    return SupabaseRepository.ok({ comments: data.map(Comment.fromRow) });
  }

  async add({ audioId, userId, draft }) {
    if (!this.configured) return this.notConfigured();
    const invalid = draft.validate();
    if (invalid) return SupabaseRepository.fail(invalid);
    const { data, error } = await this.client
      .from(CommentRepository.TABLE)
      .insert(this.withChannel({ audio_id: audioId, user_id: userId, body: draft.trimmed }))
      .select("id, audio_id, user_id, body, created_at, author:profiles(display_name)")
      .single();
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok({ comment: Comment.fromRow(data) });
  }

  /** 지우기 — 행은 남기고 deleted_at만 채웁니다(0007 설계). */
  async remove(id) {
    if (!this.configured) return this.notConfigured();
    const { data, error } = await this.client
      .from(CommentRepository.TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) return SupabaseRepository.fail(error.message);
    if (!data?.length) return SupabaseRepository.fail("지울 권한이 없어요.");
    return SupabaseRepository.ok();
  }
}

// ─────────────────────────────────────────────
// 좋아요·담아두기 — 마이 페이지의 "담아두기" 목록이 이 두 표시를 모아서 보여줍니다.
// ─────────────────────────────────────────────

export class AudioMarkKind {
  static LIKE = "like";
  static SAVE = "save";
  static ALL = [AudioMarkKind.LIKE, AudioMarkKind.SAVE];

  static label(kind) {
    return { like: "좋아요", save: "담아두기" }[kind] || kind;
  }
}

/** 한 콘텐츠에 대한 내 표시 상태(불변). */
export class AudioMarks {
  constructor({ liked = false, saved = false, likeCount = 0 } = {}) {
    this.liked = liked;
    this.saved = saved;
    this.likeCount = likeCount;
    Object.freeze(this);
  }

  has(kind) {
    return kind === AudioMarkKind.LIKE ? this.liked : this.saved;
  }

  /** kind를 켜거나 끈 새 상태(좋아요 수도 함께 맞춥니다). */
  toggled(kind) {
    if (kind === AudioMarkKind.LIKE) {
      return new AudioMarks({ ...this, liked: !this.liked, likeCount: Math.max(0, this.likeCount + (this.liked ? -1 : 1)) });
    }
    return new AudioMarks({ ...this, saved: !this.saved });
  }
}

export class AudioMarkRepository extends SupabaseRepository {
  static TABLE = "audio_marks";

  async stateFor(audioId, userId) {
    if (!this.configured) return this.notConfigured({ marks: new AudioMarks() });
    const [own, count] = await Promise.all([
      userId
        ? this.client.from(AudioMarkRepository.TABLE).select("kind").eq("audio_id", audioId).eq("user_id", userId)
        : Promise.resolve({ data: [] }),
      this.client.rpc("audio_like_count", { target_audio: audioId }),
    ]);
    if (own.error) return SupabaseRepository.fail(own.error.message, { marks: new AudioMarks() });
    const kinds = new Set((own.data || []).map((row) => row.kind));
    return SupabaseRepository.ok({
      marks: new AudioMarks({
        liked: kinds.has(AudioMarkKind.LIKE),
        saved: kinds.has(AudioMarkKind.SAVE),
        likeCount: Number(count.data) || 0,
      }),
    });
  }

  async set({ audioId, userId, kind, on }) {
    if (!this.configured) return this.notConfigured();
    const query = on
      ? this.client
          .from(AudioMarkRepository.TABLE)
          .upsert(this.withChannel({ audio_id: audioId, user_id: userId, kind }), { onConflict: "user_id,audio_id,kind" })
      : this.client.from(AudioMarkRepository.TABLE).delete().eq("audio_id", audioId).eq("user_id", userId).eq("kind", kind);
    const { error } = await query;
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  /** 내가 좋아요·담아두기한 콘텐츠 — 마이 페이지 "담아두기". 콘텐츠별로 하나씩, 최근 표시 순. */
  async listMine(userId) {
    if (!this.configured) return this.notConfigured({ items: [] });
    const { data, error } = await this.client
      .from(AudioMarkRepository.TABLE)
      .select("kind, created_at, audio:audios(*, channel:channels(slug))")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return SupabaseRepository.fail(error.message, { items: [] });
    return SupabaseRepository.ok({ items: MarkedAudio.group(data) });
  }
}

/** 마이 페이지 담아두기 목록의 한 줄 — 콘텐츠 하나와, 내가 거기에 남긴 표시들. */
export class MarkedAudio {
  constructor({ audioRow, kinds, markedAt }) {
    this.audioRow = audioRow;
    this.kinds = kinds;
    this.markedAt = markedAt;
    Object.freeze(this);
  }

  /** kind 표시를 뺀 새 항목(남은 표시가 없으면 null — 목록에서 빠짐). */
  withoutKind(kind) {
    const kinds = this.kinds.filter((k) => k !== kind);
    return kinds.length ? new MarkedAudio({ ...this, kinds }) : null;
  }

  static group(rows) {
    const byAudio = new Map();
    for (const row of rows || []) {
      if (!row.audio) continue; // 지워진 콘텐츠
      const entry = byAudio.get(row.audio.id) || { audioRow: row.audio, kinds: [], markedAt: row.created_at };
      entry.kinds.push(row.kind);
      if (row.created_at > entry.markedAt) entry.markedAt = row.created_at;
      byAudio.set(row.audio.id, entry);
    }
    return [...byAudio.values()].map((entry) => new MarkedAudio(entry));
  }
}

// ─────────────────────────────────────────────
// 감상일기 — 항상 오디오 콘텐츠 하나와 짝을 이룹니다(본인만 볼 수 있음).
// ─────────────────────────────────────────────

export class JournalDraft {
  static MAX_LENGTH = 3000;

  constructor(body = "") {
    this.body = String(body);
    Object.freeze(this);
  }

  validate() {
    if (!this.body.trim()) return "감상을 적어주세요.";
    if (this.body.length > JournalDraft.MAX_LENGTH) return `감상일기는 ${JournalDraft.MAX_LENGTH}자까지 쓸 수 있어요.`;
    return null;
  }
}

export class JournalEntry {
  constructor({ id, audioId, body, createdAt, updatedAt, audioRow = null }) {
    Object.assign(this, { id, audioId, body, createdAt, updatedAt, audioRow });
    Object.freeze(this);
  }

  static fromRow(row) {
    return new JournalEntry({
      id: row.id,
      audioId: row.audio_id,
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      audioRow: row.audio || null,
    });
  }

  /** 짝이 되는 콘텐츠 정보를 붙인 새 항목(고친 일기에 목록의 콘텐츠 정보를 다시 붙일 때). */
  withAudio(audioRow) {
    return new JournalEntry({ ...this, audioRow });
  }

  get dateLabel() {
    return String(this.createdAt || "").slice(0, 10).replaceAll("-", ".");
  }

  get isEdited() {
    return Boolean(this.updatedAt && this.createdAt && this.updatedAt.slice(0, 16) !== this.createdAt.slice(0, 16));
  }
}

export class JournalRepository extends SupabaseRepository {
  static TABLE = "journal_entries";

  /** 한 콘텐츠에 대해 내가 쓴 감상일기들(최신순). */
  async listForAudio(audioId) {
    if (!this.configured) return this.notConfigured({ entries: [] });
    const { data, error } = await this.client
      .from(JournalRepository.TABLE)
      .select("*")
      .eq("audio_id", audioId)
      .order("created_at", { ascending: false });
    if (error) return SupabaseRepository.fail(error.message, { entries: [] });
    return SupabaseRepository.ok({ entries: data.map(JournalEntry.fromRow) });
  }

  /** 내 감상일기 전체 — 짝이 되는 콘텐츠 정보와 함께. */
  async listMine() {
    if (!this.configured) return this.notConfigured({ entries: [] });
    const { data, error } = await this.client
      .from(JournalRepository.TABLE)
      .select("*, audio:audios(*, channel:channels(slug))")
      .order("created_at", { ascending: false });
    if (error) return SupabaseRepository.fail(error.message, { entries: [] });
    return SupabaseRepository.ok({ entries: data.map(JournalEntry.fromRow) });
  }

  async add({ audioId, userId, draft }) {
    if (!this.configured) return this.notConfigured();
    const invalid = draft.validate();
    if (invalid) return SupabaseRepository.fail(invalid);
    const { data, error } = await this.client
      .from(JournalRepository.TABLE)
      .insert(this.withChannel({ audio_id: audioId, user_id: userId, body: draft.body.trim() }))
      .select("*")
      .single();
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok({ entry: JournalEntry.fromRow(data) });
  }

  async update(id, draft) {
    if (!this.configured) return this.notConfigured();
    const invalid = draft.validate();
    if (invalid) return SupabaseRepository.fail(invalid);
    const { data, error } = await this.client
      .from(JournalRepository.TABLE)
      .update({ body: draft.body.trim() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok({ entry: JournalEntry.fromRow(data) });
  }

  async remove(id) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.from(JournalRepository.TABLE).delete().eq("id", id);
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }
}
