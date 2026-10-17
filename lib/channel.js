// 멀티 채널(방송 채널 A, B, C …) 도메인 모델.
// 플랫폼 "더 라인" 안에 여러 채널이 있고, 각 채널은 대표 주소 뒤의 첫 경로
// (예: the-line.com/theline, the-line.com/saebit)로 구분됩니다.
// 서버 컴포넌트(채널 레이아웃)와 클라이언트 양쪽에서 쓰므로 "use client"를
// 붙이지 않습니다. 설계 전체는 docs/multi-channel-architecture.md 참고.

import { SupabaseRepository } from "@/lib/supabaseRepository";

export class ChannelSlug {
  /** 기존 "은혜의 밤 더 라인" 채널(채널 A)의 주소. */
  static DEFAULT = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_SLUG || "theline";

  // 플랫폼 자체가 쓰는(또는 앞으로 쓸) 최상위 경로 — 채널 주소로 쓸 수 없습니다.
  // supabase/migrations의 channels_slug_not_reserved 체크(0006, 0013에서 갱신)와
  // 목록을 똑같이 유지해야 합니다.
  static RESERVED = new Set([
    "about", "admin", "api", "apple-icon", "apply", "auth", "billing", "channels", "favicon.ico",
    "help", "icon", "login", "logout", "manifest.webmanifest", "mypage", "notes", "pricing",
    "privacy", "record", "settings", "signup", "studio", "support", "terms",
  ]);

  // 영문 소문자·숫자·하이픈 3~30자, 하이픈으로 시작/끝나지 않음. 한글 채널명은
  // 표시용 name에 쓰고, 주소(slug)는 공유·입력이 쉬운 영문으로 받습니다.
  static #PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

  static normalize(value) {
    let text = String(value || "");
    try {
      text = decodeURIComponent(text);
    } catch (e) {
      // 잘못 인코딩된 주소는 그대로 두고 아래 형식 검사에서 걸러냅니다.
    }
    return text.trim().toLowerCase();
  }

  /** 채널 주소로 쓸 수 있는지. 실패하면 사유를, 통과하면 null을 돌려줍니다. */
  static validate(value) {
    const slug = ChannelSlug.normalize(value);
    if (!ChannelSlug.#PATTERN.test(slug)) {
      return "채널 주소는 영문 소문자·숫자·하이픈(-)으로 3~30자여야 합니다.";
    }
    if (ChannelSlug.RESERVED.has(slug)) return "이미 플랫폼에서 사용 중인 주소입니다.";
    return null;
  }

  static isValid(value) {
    return ChannelSlug.validate(value) === null;
  }
}

export class Channel {
  static STATUS = Object.freeze({ PENDING: "pending", ACTIVE: "active", SUSPENDED: "suspended" });

  constructor({ id = null, slug, name, status = Channel.STATUS.ACTIVE, isPlatform = false }) {
    this.id = id; // null = 채널 테이블이 아직 없는 레거시 단일 사이트 모드
    this.slug = slug;
    this.name = name;
    this.status = status;
    // 플랫폼 운영 채널 — 이 채널이 라이브러리에 올린 자산은 플랫폼 공용 자산이 됩니다.
    this.isPlatform = isPlatform;
  }

  static fromRow(row) {
    return new Channel({
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      isPlatform: Boolean(row.is_platform),
    });
  }

  /** channels 마이그레이션 전(또는 Supabase 미설정)에도 기존 사이트가 그대로
   *  동작하도록 쓰는 기본 채널. id가 null이라 데이터를 채널로 나누지 않습니다. */
  static legacyDefault(name) {
    return new Channel({ slug: ChannelSlug.DEFAULT, name, isPlatform: true });
  }

  get isLegacy() {
    return this.id === null;
  }

  get isActive() {
    return this.status === Channel.STATUS.ACTIVE;
  }

  /** 채널 안의 경로. path("record") → "/theline/record" */
  path(sub = "") {
    const tail = String(sub).replace(/^\/+/, "");
    return tail ? `/${this.slug}/${tail}` : `/${this.slug}`;
  }

  /** 콘텐츠 화면 주소 — 그 콘텐츠의 배경이미지 위에서 크게 재생하는 화면. */
  contentPath(audioId) {
    return Channel.contentHref(this.slug, audioId);
  }

  static contentHref(slug, audioId) {
    return `/${slug}/content/${encodeURIComponent(audioId)}`;
  }

  /** 지금 경로가 이 채널의 콘텐츠 화면인지. */
  isContentPath(pathname) {
    return pathname.startsWith(`/${this.slug}/content/`);
  }

  /** 서버 → 클라이언트 컴포넌트로 넘길 수 있는 평범한 객체. */
  toJSON() {
    return {
      id: this.id,
      slug: this.slug,
      name: this.name,
      status: this.status,
      isPlatform: this.isPlatform,
    };
  }
}

export class ChannelRepository extends SupabaseRepository {
  static TABLE = "channels";

  async findBySlug(slug) {
    if (!this.configured) return this.notConfigured({ row: null });
    const { data, error } = await this.client
      .from(ChannelRepository.TABLE)
      .select("*") // 이후 마이그레이션에서 추가되는 컬럼(is_platform 등)이 아직 없어도 동작하도록
      .eq("slug", slug)
      .maybeSingle();
    if (error) return SupabaseRepository.fail(error.message, { row: null });
    return SupabaseRepository.ok({ row: data });
  }

  /** 채널 구독자 수(0010_channel_profile.sql의 함수). 채널 구조 적용 전이면 0. */
  async followerCount(channelId) {
    if (!this.configured || !channelId) return SupabaseRepository.ok({ count: 0 });
    const { data, error } = await this.client.rpc("channel_follower_count", { target_channel: channelId });
    if (error) return SupabaseRepository.fail(error.message, { count: 0 });
    return SupabaseRepository.ok({ count: Number(data) || 0 });
  }

  /** 채널 id → 주소 목록(랜딩처럼 여러 채널의 콘텐츠를 한꺼번에 보여줄 때). */
  async slugMap() {
    if (!this.configured) return this.notConfigured({ map: new Map() });
    const { data, error } = await this.client.from(ChannelRepository.TABLE).select("id, slug");
    if (error) return SupabaseRepository.fail(error.message, { map: new Map() });
    return SupabaseRepository.ok({ map: new Map(data.map((row) => [row.id, row.slug])) });
  }
}

/** URL의 채널 주소 → Channel. 없는 채널이면 null(→ 404). */
export class ChannelResolver {
  constructor({ repository = new ChannelRepository(), defaultName }) {
    this.repository = repository;
    this.defaultName = defaultName;
  }

  async resolve(rawSlug) {
    const slug = ChannelSlug.normalize(rawSlug);
    if (!ChannelSlug.isValid(slug)) return null;
    const isDefault = slug === ChannelSlug.DEFAULT;

    const result = await this.repository.findBySlug(slug);
    if (result.ok && result.row) return Channel.fromRow(result.row);
    // 기본 채널은 Supabase 미설정이거나 channels 테이블이 아직 없을 때(마이그레이션
    // 적용 전)에도 지금처럼 단일 사이트로 동작해야 합니다.
    if (isDefault && (!result.ok || !this.repository.configured)) {
      return Channel.legacyDefault(this.defaultName);
    }
    return null;
  }
}
