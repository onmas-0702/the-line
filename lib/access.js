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

/** 지금 화면을 보고 있는 사람. 로그인 연동 전에는 항상 Viewer.guest()입니다. */
export class Viewer {
  constructor({ userId = null, isPaid = false, ownedChannelCount = 0, channelRoles = {} } = {}) {
    this.userId = userId;
    this.isPaid = isPaid; // member_subscriptions가 trialing/active
    this.ownedChannelCount = ownedChannelCount;
    this.channelRoles = channelRoles; // { [channelId]: "owner" | "editor" }
  }

  static guest() {
    return new Viewer();
  }

  get tier() {
    if (!this.userId) return MemberTier.GUEST;
    return this.isPaid ? MemberTier.PAID : MemberTier.MEMBER;
  }

  roleIn(channel) {
    return channel?.id ? this.channelRoles[channel.id] || null : null;
  }
}

export class AccessPolicy {
  /** 콘텐츠 관람 — 운영 중인 채널이면 누구나. */
  static canView(viewer, channel) {
    return Boolean(channel?.isActive);
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

  /** 채널 설정·편집자 초대 같은 소유자 전용 작업. */
  static canAdministerChannel(viewer, channel) {
    return viewer.roleIn(channel) === "owner";
  }
}
