// 구독자 커뮤니티 — 운영자 공지와 카카오톡 오픈채팅 참여 정보.
// 운영자는 스튜디오의 "공지·커뮤니티" 탭에서 쓰고, 구독자는 My Page에서 읽습니다.
// DB 규칙은 0016_engagement_mypage.sql(channel_notices, channel_community).

import { SupabaseRepository } from "@/lib/supabaseRepository";

export class NoticeDraft {
  static TITLE_MAX = 100;
  static BODY_MAX = 5000;

  constructor({ title = "", body = "", isPinned = false } = {}) {
    this.title = String(title);
    this.body = String(body);
    this.isPinned = Boolean(isPinned);
    Object.freeze(this);
  }

  with(patch) {
    return new NoticeDraft({ ...this, ...patch });
  }

  validate() {
    if (!this.title.trim()) return "공지 제목을 적어주세요.";
    if (this.title.length > NoticeDraft.TITLE_MAX) return `제목은 ${NoticeDraft.TITLE_MAX}자까지예요.`;
    if (!this.body.trim()) return "공지 내용을 적어주세요.";
    if (this.body.length > NoticeDraft.BODY_MAX) return `내용은 ${NoticeDraft.BODY_MAX}자까지예요.`;
    return null;
  }

  toRow() {
    return { title: this.title.trim(), body: this.body.trim(), is_pinned: this.isPinned };
  }
}

export class Notice {
  constructor({ id, channelId, channelName, title, body, isPinned, createdAt }) {
    Object.assign(this, { id, channelId, channelName, title, body, isPinned, createdAt });
    Object.freeze(this);
  }

  static fromRow(row) {
    return new Notice({
      id: row.id,
      channelId: row.channel_id,
      channelName: row.channel?.name || "",
      title: row.title,
      body: row.body,
      isPinned: Boolean(row.is_pinned),
      createdAt: row.created_at,
    });
  }

  get dateLabel() {
    return String(this.createdAt || "").slice(0, 10).replaceAll("-", ".");
  }

  /** 최근 7일 안의 공지인지("새 공지" 표시). */
  get isRecent() {
    return Date.now() - new Date(this.createdAt).getTime() < 7 * 86400 * 1000;
  }
}

export class NoticeRepository extends SupabaseRepository {
  static TABLE = "channel_notices";
  static SELECT = "*, channel:channels(name)";

  /** 이 저장소의 채널 공지(채널 없이 만들면 읽을 수 있는 모든 채널의 공지). 고정 공지가 먼저. */
  async list() {
    if (!this.configured) return this.notConfigured({ notices: [] });
    const { data, error } = await this.scoped(this.client.from(NoticeRepository.TABLE).select(NoticeRepository.SELECT))
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return SupabaseRepository.fail(error.message, { notices: [] });
    return SupabaseRepository.ok({ notices: data.map(Notice.fromRow) });
  }

  async add(draft, { authorId }) {
    if (!this.configured) return this.notConfigured();
    const invalid = draft.validate();
    if (invalid) return SupabaseRepository.fail(invalid);
    const { data, error } = await this.client
      .from(NoticeRepository.TABLE)
      .insert(this.withChannel({ ...draft.toRow(), author_id: authorId }))
      .select(NoticeRepository.SELECT)
      .single();
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok({ notice: Notice.fromRow(data) });
  }

  async update(id, draft) {
    if (!this.configured) return this.notConfigured();
    const invalid = draft.validate();
    if (invalid) return SupabaseRepository.fail(invalid);
    const { data, error } = await this.scoped(this.client.from(NoticeRepository.TABLE).update(draft.toRow()).eq("id", id))
      .select(NoticeRepository.SELECT)
      .single();
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok({ notice: Notice.fromRow(data) });
  }

  async remove(id) {
    if (!this.configured) return this.notConfigured();
    return this.deleteRow(NoticeRepository.TABLE, id);
  }
}

/** 오픈채팅 참여 정보(불변). */
export class CommunityInfo {
  static KAKAO_OPEN_CHAT = /^https:\/\/open\.kakao\.com\/[A-Za-z0-9/_-]+$/;

  constructor({ channelId = null, channelName = "", openChatUrl = "", entryCode = "", guide = "" } = {}) {
    this.channelId = channelId;
    this.channelName = channelName;
    this.openChatUrl = openChatUrl || "";
    this.entryCode = entryCode || "";
    this.guide = guide || "";
    Object.freeze(this);
  }

  static fromRow(row) {
    return new CommunityInfo({
      channelId: row.channel_id,
      channelName: row.channel?.name || "",
      openChatUrl: row.open_chat_url,
      entryCode: row.entry_code,
      guide: row.guide,
    });
  }

  with(patch) {
    return new CommunityInfo({ ...this, ...patch });
  }

  get isReady() {
    return Boolean(this.openChatUrl);
  }

  validate() {
    const url = this.openChatUrl.trim();
    if (url && !CommunityInfo.KAKAO_OPEN_CHAT.test(url)) {
      return "카카오톡 오픈채팅 링크(https://open.kakao.com/…)를 넣어주세요.";
    }
    if (this.entryCode.length > 20) return "참여코드는 20자까지예요.";
    if (this.guide.length > 1000) return "안내는 1000자까지예요.";
    return null;
  }

  toRow() {
    return {
      open_chat_url: this.openChatUrl.trim() || null,
      entry_code: this.entryCode.trim() || null,
      guide: this.guide.trim() || null,
    };
  }
}

export class ChannelCommunityRepository extends SupabaseRepository {
  static TABLE = "channel_community";

  /** 채널 한정이면 그 채널의 정보 하나, 아니면 읽을 수 있는 모든 채널의 정보. */
  async list() {
    if (!this.configured) return this.notConfigured({ items: [] });
    const { data, error } = await this.scoped(
      this.client.from(ChannelCommunityRepository.TABLE).select("*, channel:channels(name)")
    );
    if (error) return SupabaseRepository.fail(error.message, { items: [] });
    return SupabaseRepository.ok({ items: data.map(CommunityInfo.fromRow) });
  }

  async fetch() {
    const result = await this.list();
    return { ...result, info: result.items?.[0] || new CommunityInfo({ channelId: this.channelId }) };
  }

  async save(info) {
    if (!this.configured) return this.notConfigured();
    if (!this.channelId) return SupabaseRepository.fail("채널이 정해지지 않았어요.");
    const invalid = info.validate();
    if (invalid) return SupabaseRepository.fail(invalid);
    const { error } = await this.client
      .from(ChannelCommunityRepository.TABLE)
      .upsert({ channel_id: this.channelId, ...info.toRow() }, { onConflict: "channel_id" });
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }
}
