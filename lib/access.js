// 회원 등급과 권한 규칙 — "누가 무엇을 할 수 있는가"를 이 파일 한 곳에서만 정합니다.
// 정책이 바뀌면 여기만 고치면 되고, 화면·서버 코드는 AccessPolicy의 메서드만 부릅니다.
// DB 쪽 RLS(supabase/migrations)도 같은 규칙을 따르도록 함께 맞춰주세요.
//
// 사용자 구분(2026-11 결정, docs/multi-channel-architecture.md 1장):
//   방문자(GUEST)       — 로그인 안 함. 모든 콘텐츠 무료 관람
//   회원(MEMBER)        — 무료 가입한 비구독자. + 한줄평·이모지 댓글, 좋아요
//   구독자(SUBSCRIBER)  — 플랫폼 유료 구독(월 5천·연 5만). + 담아두기, 마이 페이지(공지·
//                         담아두기·감상일기·오픈채팅 참여)
//   채널운영자          — 등급이 아니라 "채널 역할"(owner/editor)입니다. 지금은 운영사 채널
//                         하나뿐이고, 개설 신청·운영자 요금(월 1만)·정산은 다음 단계입니다.

export class MemberTier {
  static GUEST = "guest";
  static MEMBER = "member";
  static SUBSCRIBER = "subscriber";

  static #RANK = { guest: 0, member: 1, subscriber: 2 };

  static atLeast(tier, required) {
    return MemberTier.#RANK[tier] >= MemberTier.#RANK[required];
  }

  static label(tier) {
    return { guest: "방문자", member: "회원", subscriber: "구독자" }[tier] || "";
  }
}

/** 지금 화면을 보고 있는 사람. 서버(lib/supabaseServer.js의 ServerViewer)가 로그인 세션과
 *  DB의 current_viewer() 결과로 만들고, toJSON()으로 클라이언트에 넘기면
 *  ViewerProvider가 fromJSON()으로 되살립니다. 불변 객체로 다룹니다. */
export class Viewer {
  static #ANY_CHANNEL = "*";
  static #PREVIEW_ID = "preview-admin";

  constructor({
    userId = null,
    email = "",
    displayName = "",
    isSubscriber = false,
    subscription = null, // { planCode, status, currentPeriodEnd }
    hasStudioPlan = false,
    ownedChannelCount = 0,
    channelRoles = {}, // { [channelId]: "owner" | "editor" }
    channelPermissions = {}, // { [channelId]: ["content", "manage", …] } — 공동 운영자의 기능(lib/staff.js)
  } = {}) {
    this.userId = userId;
    this.email = email;
    this.displayName = displayName;
    this.isSubscriber = isSubscriber;
    this.subscription = subscription;
    this.hasStudioPlan = hasStudioPlan;
    this.ownedChannelCount = ownedChannelCount;
    this.channelRoles = channelRoles;
    this.channelPermissions = channelPermissions;
    Object.freeze(this);
  }

  static guest() {
    return new Viewer();
  }

  /** 로그인은 했지만 DB 정보(current_viewer)를 아직 못 읽은 경우 — 마이그레이션 적용 전 등. */
  static signedIn({ userId, email = "", displayName = "" }) {
    return new Viewer({ userId, email, displayName: displayName || Viewer.nameFromEmail(email) });
  }

  /** current_viewer() RPC 결과(json) → Viewer. */
  static fromContext(context, { email = "" } = {}) {
    if (!context?.user_id) return Viewer.guest();
    return new Viewer({
      userId: context.user_id,
      email,
      displayName: context.display_name || Viewer.nameFromEmail(email),
      isSubscriber: Boolean(context.is_subscriber),
      subscription: context.subscription
        ? {
            planCode: context.subscription.plan_code,
            status: context.subscription.status,
            currentPeriodEnd: context.subscription.current_period_end || null,
          }
        : null,
      hasStudioPlan: Boolean(context.has_studio_plan),
      ownedChannelCount: Number(context.owned_channel_count) || 0,
      channelRoles: context.channel_roles || {},
      // 0018 적용 전에는 channel_permissions가 없습니다 — 그때는 예전처럼 운영자면 모든 기능.
      channelPermissions: context.channel_permissions || null,
    });
  }

  /** 개발용 임시 관리자 — 모든 채널의 소유자이자 구독자로 취급합니다.
   *  NEXT_PUBLIC_PREVIEW_ADMIN=true일 때만 쓰입니다(ServerViewer 참고). */
  static previewAdmin() {
    return new Viewer({
      userId: Viewer.#PREVIEW_ID,
      displayName: "임시 관리자",
      isSubscriber: true,
      hasStudioPlan: true,
      channelRoles: { [Viewer.#ANY_CHANNEL]: "owner" },
    });
  }

  static nameFromEmail(email) {
    return String(email || "").split("@")[0];
  }

  static fromJSON(json) {
    return json ? new Viewer(json) : Viewer.guest();
  }

  toJSON() {
    return {
      userId: this.userId,
      email: this.email,
      displayName: this.displayName,
      isSubscriber: this.isSubscriber,
      subscription: this.subscription,
      hasStudioPlan: this.hasStudioPlan,
      ownedChannelCount: this.ownedChannelCount,
      channelRoles: this.channelRoles,
      channelPermissions: this.channelPermissions,
    };
  }

  get isSignedIn() {
    return Boolean(this.userId);
  }

  get isPreviewAdmin() {
    return this.userId === Viewer.#PREVIEW_ID;
  }

  get tier() {
    if (!this.userId) return MemberTier.GUEST;
    return this.isSubscriber ? MemberTier.SUBSCRIBER : MemberTier.MEMBER;
  }

  /** 어느 채널이든 운영(소유자·편집자)하고 있는지. */
  get isChannelStaff() {
    return Object.keys(this.channelRoles).length > 0;
  }

  roleIn(channel) {
    if (!channel) return null;
    return (channel.id && this.channelRoles[channel.id]) || this.channelRoles[Viewer.#ANY_CHANNEL] || null;
  }

  /** 이 기능을 맡은 채널 id 목록(채널 화면 밖, 예: 마이 페이지에서 어느 채널의 공지를 쓸지).
   *  임시 관리자는 특정 채널이 없어서 "*" 하나를 돌려줍니다. */
  channelIdsAllowing(permissionKey) {
    return Object.keys(this.channelRoles).filter((id) => this.canUseInChannel({ id }, permissionKey) || id === Viewer.#ANY_CHANNEL);
  }

  /** 그 채널에서 이 기능(lib/staff.js의 StudioPermission key)을 쓸 수 있는지.
   *  소유자는 모든 기능, 공동 운영자는 소유자가 맡긴 기능만. */
  canUseInChannel(channel, permissionKey) {
    const role = this.roleIn(channel);
    if (!role) return false;
    if (role === "owner" || this.channelPermissions === null) return true;
    const granted = (channel.id && this.channelPermissions?.[channel.id]) || [];
    return granted.includes(permissionKey);
  }
}

export class AccessPolicy {
  /** 콘텐츠 관람 — 운영 중인 채널이면 누구나. */
  static canView(viewer, channel) {
    return Boolean(channel?.isActive);
  }

  /** 한줄평·이모지 댓글 — 회원 이상. */
  static canComment(viewer) {
    return MemberTier.atLeast(viewer.tier, MemberTier.MEMBER);
  }

  /** 좋아요 — 회원 이상. */
  static canLike(viewer) {
    return MemberTier.atLeast(viewer.tier, MemberTier.MEMBER);
  }

  /** 구독자 전용 기능을 쓸 수 있는지 — 구독자이거나, 채널 운영자(자기 공지·커뮤니티 확인용). */
  static hasSubscriberAccess(viewer) {
    return MemberTier.atLeast(viewer.tier, MemberTier.SUBSCRIBER) || viewer.isChannelStaff;
  }

  /** 담아두기 — 구독자. */
  static canSave(viewer) {
    return AccessPolicy.hasSubscriberAccess(viewer);
  }

  /** 감상일기 — 구독자. */
  static canWriteJournal(viewer) {
    return AccessPolicy.hasSubscriberAccess(viewer);
  }

  /** 운영자 공지 보기 — 구독자. */
  static canReadNotices(viewer) {
    return AccessPolicy.hasSubscriberAccess(viewer);
  }

  /** 카카오톡 오픈채팅 참여 정보 — 구독자. */
  static canJoinCommunity(viewer) {
    return AccessPolicy.hasSubscriberAccess(viewer);
  }

  /** 마이 페이지 들어가기 — 로그인한 회원 이상(메뉴별 권한은 MyPageMenu가 따로 봅니다). */
  static canOpenMyPage(viewer) {
    return viewer.isSignedIn;
  }

  /** 유료 구독 신청 — 로그인했고 아직 구독자가 아닐 때. */
  static canStartSubscription(viewer) {
    return viewer.isSignedIn && !viewer.isSubscriber;
  }

  /** 새 채널(스튜디오) 개설 — 채널운영 요금제가 있고, 한도 안일 때(다음 단계 기능). */
  static canCreateChannel(viewer, { channelLimit = 1 } = {}) {
    return viewer.hasStudioPlan && viewer.ownedChannelCount < channelLimit;
  }

  /** 그 채널의 스튜디오(/{채널}/studio)에 들어가기 — 채널 운영자(소유자·공동 운영자)만.
   *  안에서 무엇을 할 수 있는지는 canUseStudio로 기능별로 봅니다. */
  static canManageChannel(viewer, channel) {
    return viewer.roleIn(channel) !== null;
  }

  /** 스튜디오 기능 하나(StudioPermission key: content·manage·design·community)를 쓸 수 있는지. */
  static canUseStudio(viewer, channel, permissionKey) {
    return viewer.canUseInChannel(channel, permissionKey);
  }

  /** 공지 쓰기·오픈채팅 정보 관리. */
  static canPostNotice(viewer, channel) {
    return AccessPolicy.canUseStudio(viewer, channel, "community");
  }

  /** 채널 화면 밖(마이 페이지)에서 공지를 쓸 수 있는지 — 공지 기능을 맡은 채널이 하나라도 있으면. */
  static canWriteNotices(viewer) {
    return viewer.channelIdsAllowing("community").length > 0;
  }

  /** 운영자 지정·해제 — 채널 소유자만. */
  static canManageStaff(viewer, channel) {
    return viewer.roleIn(channel) === "owner";
  }

  /** 댓글 지우기 — 본인 댓글이거나 그 채널 운영자. */
  static canDeleteComment(viewer, channel, comment) {
    return (viewer.isSignedIn && comment.userId === viewer.userId) || AccessPolicy.canManageChannel(viewer, channel);
  }

  /** 플랫폼 공용 자산으로 올리기·수정·숨기기 — 플랫폼 운영 채널의 관리자만. */
  static canPublishSharedAsset(viewer, channel) {
    return Boolean(channel?.isPlatform) && AccessPolicy.canManageChannel(viewer, channel);
  }

  /** 공용 자산을 내 채널로 가져가기 — 그 채널의 관리자이고, 자산이 가져가기를 허용할 때. */
  static canImportAsset(viewer, channel, asset) {
    return AccessPolicy.canManageChannel(viewer, channel) && asset.isShared && asset.allowImport;
  }

  /** 자산 파일 다운로드 — 올린 채널의 관리자이거나, 공용 자산이 다운로드를 허용할 때만.
   *  Suno 곡처럼 출처상 다운로드를 허용할 수 없는 자산은 공용이어도 막습니다. */
  static canDownloadAsset(viewer, channel, asset) {
    const isOwner = channel?.id === asset.ownerChannelId && AccessPolicy.canManageChannel(viewer, channel);
    if (isOwner) return true;
    return asset.isShared && asset.allowDownload && asset.provenance.mayAllowDownload && viewer.tier !== MemberTier.GUEST;
  }

  /** 채널 설정·편집자 초대 같은 소유자 전용 작업. */
  static canAdministerChannel(viewer, channel) {
    return viewer.roleIn(channel) === "owner";
  }
}

/** 기능 하나를 지금 쓸 수 있는지, 못 쓰면 무엇이 필요한지(로그인/구독) — 화면에서
 *  "로그인하고 남기기", "구독하고 담아두기" 같은 안내를 고르는 데 씁니다. 불변. */
export class FeatureGate {
  static Feature = Object.freeze({
    COMMENT: "comment",
    LIKE: "like",
    SAVE: "save",
    JOURNAL: "journal",
    NOTICES: "notices",
    COMMUNITY: "community",
  });

  static #RULES = {
    comment: AccessPolicy.canComment,
    like: AccessPolicy.canLike,
    save: AccessPolicy.canSave,
    journal: AccessPolicy.canWriteJournal,
    notices: AccessPolicy.canReadNotices,
    community: AccessPolicy.canJoinCommunity,
  };

  constructor(allowed, needs) {
    this.allowed = allowed;
    this.needs = needs; // null | "signin" | "subscribe"
    Object.freeze(this);
  }

  static check(viewer, feature) {
    const rule = FeatureGate.#RULES[feature];
    if (!rule) throw new Error(`알 수 없는 기능: ${feature}`);
    if (rule(viewer)) return new FeatureGate(true, null);
    return new FeatureGate(false, viewer.isSignedIn ? "subscribe" : "signin");
  }
}
