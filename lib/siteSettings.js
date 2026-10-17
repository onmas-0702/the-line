"use client";

// 채널별 디자인(배경 스킨 이미지 + 홈 글자색) 설정 — "제작/관리 → 디자인" 탭에서
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

  /** 현재 적용된 배경 스킨 URL + 홈 화면 글자색을 가져옵니다. */
  async fetch() {
    const empty = { url: null, textColor: null };
    if (!this.configured) return this.notConfigured(empty);
    const { data, error } = await this.client
      .from(SiteSettingsRepository.TABLE)
      .select("skin_image_url, text_color")
      .eq("id", this.#rowId)
      .maybeSingle();
    if (error) return SupabaseRepository.fail(error.message, empty);
    return SupabaseRepository.ok({
      url: data?.skin_image_url || null,
      textColor: data?.text_color || null,
    });
  }

  /** 홈 화면 글자색을 바꿉니다(배경 이미지 위에서도 잘 읽히도록 관리자가 조절). */
  async updateTextColor(color) {
    if (!this.configured) return this.notConfigured();
    return this.#upsert({ text_color: color });
  }

  /** 배경 스킨을 기본값(없음)으로 되돌립니다. 업로드된 파일은 스토리지에 남지만
   *  (정리는 나중 단계), site_settings의 참조만 지워서 즉시 화면에서 빠집니다. */
  async clearSkinImage() {
    if (!this.configured) return this.notConfigured();
    return this.#upsert({ skin_image_url: null });
  }
}
