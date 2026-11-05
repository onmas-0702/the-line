// 채널 운영자(스태프)와 기능별 권한. 소유자(owner)는 모든 기능을 쓰고, 공동 운영자(editor)는
// 소유자가 골라 준 기능만 씁니다. DB의 0018_channel_staff.sql(has_channel_permission,
// channel_staff_* 함수)과 같은 목록을 유지해야 합니다.
// 서버·클라이언트 양쪽에서 쓰므로 "use client"를 붙이지 않습니다.

import { SupabaseRepository } from "@/lib/supabaseRepository";

export class StudioPermission {
  constructor({ key, label, description }) {
    this.key = key;
    this.label = label;
    this.description = description;
    Object.freeze(this);
  }

  static CONTENT = new StudioPermission({
    key: "content",
    label: "콘텐츠 제작",
    description: "녹음·파일 업로드로 새 콘텐츠를 만들고, 배경음악·배경이미지를 올려요.",
  });
  static MANAGE = new StudioPermission({
    key: "manage",
    label: "콘텐츠 관리",
    description: "올린 콘텐츠의 정보·배경이미지를 고치거나 지워요.",
  });
  static DESIGN = new StudioPermission({
    key: "design",
    label: "채널 디자인",
    description: "로고·대표이미지·소개글·기본 배경 이미지를 바꿔요.",
  });
  static COMMUNITY = new StudioPermission({
    key: "community",
    label: "공지·오픈채팅",
    description: "구독자 공지를 쓰고 오픈채팅 링크를 관리해요.",
  });

  static ALL = Object.freeze([
    StudioPermission.CONTENT,
    StudioPermission.MANAGE,
    StudioPermission.DESIGN,
    StudioPermission.COMMUNITY,
  ]);

  static KEYS = Object.freeze(StudioPermission.ALL.map((p) => p.key));

  static find(key) {
    return StudioPermission.ALL.find((p) => p.key === key) || null;
  }

  /** 알 수 없는 값은 버리고, 정해진 순서로 정리한 key 목록. */
  static normalize(keys) {
    const set = new Set(keys || []);
    return StudioPermission.KEYS.filter((key) => set.has(key));
  }
}

export class StaffRole {
  static OWNER = "owner";
  static EDITOR = "editor";

  static label(role) {
    return role === StaffRole.OWNER ? "소유자" : "공동 운영자";
  }
}

/** 운영자 한 명(불변). */
export class StaffMember {
  constructor({ userId, email, displayName, role, permissions = [], createdAt = null }) {
    this.userId = userId;
    this.email = email;
    this.displayName = displayName;
    this.role = role;
    this.permissions = StudioPermission.normalize(permissions);
    this.createdAt = createdAt;
    Object.freeze(this);
  }

  static fromRow(row) {
    return new StaffMember({
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      permissions: row.permissions,
      createdAt: row.created_at,
    });
  }

  get isOwner() {
    return this.role === StaffRole.OWNER;
  }

  has(permissionKey) {
    return this.isOwner || this.permissions.includes(permissionKey);
  }

  /** 기능 하나를 켜거나 끈 새 운영자. */
  toggled(permissionKey) {
    const next = this.permissions.includes(permissionKey)
      ? this.permissions.filter((k) => k !== permissionKey)
      : [...this.permissions, permissionKey];
    return new StaffMember({ ...this, permissions: next });
  }
}

/** 새 운영자를 지정하는 입력(불변). */
export class StaffInvite {
  static #EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  constructor({ email = "", permissions = [StudioPermission.CONTENT.key] } = {}) {
    this.email = String(email);
    this.permissions = StudioPermission.normalize(permissions);
    Object.freeze(this);
  }

  with(patch) {
    return new StaffInvite({ ...this, ...patch });
  }

  toggled(permissionKey) {
    const next = this.permissions.includes(permissionKey)
      ? this.permissions.filter((k) => k !== permissionKey)
      : [...this.permissions, permissionKey];
    return this.with({ permissions: next });
  }

  validate() {
    if (!StaffInvite.#EMAIL.test(this.email.trim())) return "운영자로 지정할 회원의 이메일을 정확히 적어주세요.";
    if (this.permissions.length === 0) return "맡길 기능을 하나 이상 골라주세요.";
    return null;
  }
}

/** 운영자 목록·지정·해제 — DB의 소유자 전용 함수(channel_staff_*)를 부릅니다. */
export class ChannelStaffRepository extends SupabaseRepository {
  #requireChannel() {
    return this.channelId ? null : SupabaseRepository.fail("채널이 정해지지 않았어요.");
  }

  async list() {
    if (!this.configured) return this.notConfigured({ staff: [] });
    const missing = this.#requireChannel();
    if (missing) return { ...missing, staff: [] };
    const { data, error } = await this.client.rpc("channel_staff_list", { target_channel: this.channelId });
    if (error) return SupabaseRepository.fail(error.message, { staff: [] });
    return SupabaseRepository.ok({ staff: (data || []).map(StaffMember.fromRow) });
  }

  /** 이메일로 회원을 운영자로 지정(이미 운영자면 기능만 바꿈). */
  async assign(invite) {
    if (!this.configured) return this.notConfigured();
    const missing = this.#requireChannel();
    if (missing) return missing;
    const invalid = invite.validate();
    if (invalid) return SupabaseRepository.fail(invalid);
    const { error } = await this.client.rpc("channel_staff_upsert", {
      target_channel: this.channelId,
      member_email: invite.email.trim(),
      new_permissions: invite.permissions,
    });
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  async updatePermissions(member) {
    return this.assign(new StaffInvite({ email: member.email, permissions: member.permissions }));
  }

  async remove(member) {
    if (!this.configured) return this.notConfigured();
    const missing = this.#requireChannel();
    if (missing) return missing;
    const { error } = await this.client.rpc("channel_staff_remove", {
      target_channel: this.channelId,
      member_id: member.userId,
    });
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }
}

/** 스튜디오 맨 위 탭 — 탭마다 필요한 기능. 운영자에게 맡긴 기능의 탭만 보입니다.
 *  "staff"(운영자 관리)는 소유자 전용입니다. */
export class StudioTab {
  constructor({ key, label, permission = null, ownerOnly = false }) {
    this.key = key;
    this.label = label;
    this.permission = permission;
    this.ownerOnly = ownerOnly;
    Object.freeze(this);
  }

  static ALL = Object.freeze([
    new StudioTab({ key: "content", label: "제작", permission: StudioPermission.CONTENT.key }),
    new StudioTab({ key: "manage", label: "콘텐츠 관리", permission: StudioPermission.MANAGE.key }),
    new StudioTab({ key: "design", label: "디자인", permission: StudioPermission.DESIGN.key }),
    new StudioTab({ key: "community", label: "공지", permission: StudioPermission.COMMUNITY.key }),
    new StudioTab({ key: "staff", label: "운영자", ownerOnly: true }),
  ]);

  /** policy: { canUse(permissionKey), isOwner } — 이 사람에게 보이는 탭들. */
  static visibleFor({ canUse, isOwner }) {
    return StudioTab.ALL.filter((tab) => (tab.ownerOnly ? isOwner : canUse(tab.permission)));
  }
}
