// 회원 등급과 권한 규칙 — "누가 무엇을 할 수 있는가"를 이 파일 한 곳에서만 정합니다.
// 정책이 바뀌면(예: 댓글도 유료회원만, 무료 체험 채널 허용 등) 여기만 고치면 되고,
// 화면·서버 코드는 AccessPolicy의 메서드만 부릅니다. DB 쪽 RLS(0006/0007 마이그레이션)도
// 같은 규칙을 따르도록 함께 맞춰주세요.
//
// 큰 틀:
//   비회원(GUEST)  — 모든 채널 콘텐츠 무료 관람
//   회원(MEMBER)   — + 댓글 등 참여
//   유료회원(PAID) — + 자기 채널(스튜디오) 개설

export class MemberTier {
  static GUEST = "guest";
  static MEMBER = "member";
  static PAID = "paid";

  static #RANK = { guest: 0, member: 1, paid: 2 };

  static atLeast(tier, required) {
    return MemberTier.#RANK[tier] >= MemberTier.#RANK[required];
  }
}

/** 지금 화면을 보고 있는 사람. 로그인 연동 전에는 Viewer.guest()이고, 개발 중에는
 *  관리자 화면을 확인할 수 있도록 Viewer.previewAdmin()을 씁니다(ViewerProvider 참고). */
export class Viewer {
  static #ANY_CHANNEL = "*";

  constructor({ userId = null, isPaid = false, ownedChannelCount = 0, channelRoles = {} } = {}) {
    this.userId = userId;
    this.isPaid = isPaid; // member_subscriptions가 trialing/active
    this.ownedChannelCount = ownedChannelCount;
    this.channelRoles = channelRoles; // { [channelId]: "owner" | "editor" }
  }

  static guest() {
    return new Viewer();
  }

  /** 로그인 연동 전 임시 관리자 — 모든 채널의 소유자로 취급합니다. */
  static previewAdmin() {
    return new Viewer({
      userId: "preview-admin",
      isPaid: true,
      channelRoles: { [Viewer.#ANY_CHANNEL]: "owner" },
    });
  }

  get isPreviewAdmin() {
    return this.userId === "preview-admin";
  }

  get tier() {
    if (!this.userId) return MemberTier.GUEST;
    return this.isPaid ? MemberTier.PAID : MemberTier.MEMBER;
  }

  roleIn(channel) {
    if (!channel) return null;
    return (channel.id && this.channelRoles[channel.id]) || this.channelRoles[Viewer.#ANY_CHANNEL] || null;
  }
}

export class AccessPolicy {
  /** 콘텐츠 관람 — 운영 중인 채널이면 누구나. */
  static canView(viewer, channel) {
    return Boolean(channel?.isActive);
  }

  /** 채널 구독 — 회원 이상. */
  static canSubscribe(viewer) {
    return MemberTier.atLeast(viewer.tier, MemberTier.MEMBER);
  }

  /** 댓글 작성 — 회원 이상. */
  static canComment(viewer) {
    return MemberTier.atLeast(viewer.tier, MemberTier.MEMBER);
  }

  /** 새 채널(스튜디오) 개설 — 유료회원이고, 요금제의 채널 수 한도 안일 때. */
  static canCreateChannel(viewer, { channelLimit = 1 } = {}) {
    return MemberTier.atLeast(viewer.tier, MemberTier.PAID) && viewer.ownedChannelCount < channelLimit;
  }

  /** 그 채널의 제작/관리(/{채널}/record) — 채널 멤버(소유자·편집자)만. */
  static canManageChannel(viewer, channel) {
    return viewer.roleIn(channel) !== null;
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
