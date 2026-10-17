"use client";

// 채널별 꾸미기 설정(로고·대표이미지·소개글 + 기본 배경 이미지) — "제작/관리 → 디자인" 탭에서
// 씁니다. audioStorage.js와 같은 SupabaseRepository 패턴: Supabase가 설정되어
// 있지 않으면 { ok:false, reason:"not-configured" }를 돌려주고, 호출하는 쪽에서
// 이 브라우저만의 임시 미리보기로 대체합니다.
//
// site_settings는 채널당 한 행이고 행 id = 채널 id(문자열)입니다. 채널 구분이
// 없는 레거시 모드(channelId = null)에서는 예전처럼 id = 'default' 한 행을 씁니다.

import { SupabaseRepository } from "@/lib/supabaseRepository";

export class SiteSettingsRepository extends SupabaseRepository {
  static TABLE = "site_settings";
  static BUCKET = "site-design";
  static LEGACY_ROW_ID = "default";

  get #rowId() {
    return this.channelId ? String(this.channelId) : SiteSettingsRepository.LEGACY_ROW_ID;
  }

  async #upsert(fields) {
    const { error } = await this.client
      .from(SiteSettingsRepository.TABLE)
      .upsert(this.withChannel({ id: this.#rowId, ...fields }));
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  /** 새 배경 스킨 이미지를 업로드하고 site_settings에 반영합니다. */
  async uploadSkinImage(file) {
    if (!this.configured) return this.notConfigured();
    const ext = SupabaseRepository.safeStorageExtension(file.name);
    const uploaded = await this.uploadFile(
      SiteSettingsRepository.BUCKET,
      this.storagePath(`skin/${SupabaseRepository.randomId()}${ext}`),
      file,
      { contentType: file.type || undefined }
    );
    if (!uploaded.ok) return uploaded;
    const saved = await this.#upsert({ skin_image_url: uploaded.url });
    if (!saved.ok) return saved;
    return SupabaseRepository.ok({ url: uploaded.url });
  }

  /** 규격에 맞게 다듬은 채널 이미지(ChannelImageSlot: 로고·대표이미지)를 올리고 반영합니다. */
  async uploadImage(slot, blob) {
    if (!this.configured) return this.notConfigured();
    const ext = blob.type === "image/webp" ? ".webp" : blob.type === "image/jpeg" ? ".jpg" : ".png";
    const uploaded = await this.uploadFile(
      SiteSettingsRepository.BUCKET,
      this.storagePath(`${slot.folder}/${SupabaseRepository.randomId()}${ext}`),
      blob,
      { contentType: blob.type || undefined }
    );
    if (!uploaded.ok) return uploaded;
    const saved = await this.#upsert({ [slot.column]: uploaded.url });
    if (!saved.ok) return saved;
    return SupabaseRepository.ok({ url: uploaded.url });
  }

  async clearImage(slot) {
    if (!this.configured) return this.notConfigured();
    return this.#upsert({ [slot.column]: null });
  }

  /** 채널 페이지 상단의 간단한 소개글. */
  async updateDescription(description) {
    if (!this.configured) return this.notConfigured();
    return this.#upsert({ description });
  }

  /** 현재 채널 꾸미기 설정을 가져옵니다. select("*")로 읽어서, 컬럼 추가 마이그레이션
   *  전이어도 있는 값만 돌려줍니다. */
  async fetch() {
    const empty = { url: null, coverUrl: null, bannerUrl: null, description: "" };
    if (!this.configured) return this.notConfigured(empty);
    const { data, error } = await this.client
      .from(SiteSettingsRepository.TABLE)
      .select("*")
      .eq("id", this.#rowId)
      .maybeSingle();
    if (error) return SupabaseRepository.fail(error.message, empty);
    return SupabaseRepository.ok({
      url: data?.skin_image_url || null,
      coverUrl: data?.cover_image_url || null,
      bannerUrl: data?.banner_image_url || null,
      description: data?.description || "",
    });
  }

  /** 모든 채널의 디자인 설정 — 랜딩처럼 여러 채널을 한꺼번에 보여줄 때 씁니다. */
  async listAll() {
    if (!this.configured) return this.notConfigured({ rows: [] });
    const { data, error } = await this.client.from(SiteSettingsRepository.TABLE).select("*");
    if (error) return SupabaseRepository.fail(error.message, { rows: [] });
    return SupabaseRepository.ok({ rows: data });
  }

  /** 배경 스킨을 기본값(없음)으로 되돌립니다. 업로드된 파일은 스토리지에 남지만
   *  (정리는 나중 단계), site_settings의 참조만 지워서 즉시 화면에서 빠집니다. */
  async clearSkinImage() {
    if (!this.configured) return this.notConfigured();
    return this.#upsert({ skin_image_url: null });
  }
}
