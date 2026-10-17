"use client";

// 콘텐츠 배경이미지 선택 — 제작 화면과 콘텐츠 관리 탭이 함께 씁니다.
// 고른 상태(없음 / 지금 것 유지 / 라이브러리 이미지 / 새로 올린 이미지)를 불변 객체로
// 들고 있다가, 저장할 때 commit()으로 실제 저장(새 이미지는 라이브러리에 보관)을 합니다.

import { AssetProvenance } from "@/lib/library";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export class ContentCoverChoice {
  static MODE = Object.freeze({ NONE: "none", KEEP: "keep", ASSET: "asset", NEW: "new" });

  constructor({ mode, previewUrl = null, assetId = null, file = null, displayBlob = null }) {
    this.mode = mode;
    this.previewUrl = previewUrl; // 화면에 보여줄 주소(새 이미지는 blob: 주소)
    this.assetId = assetId;
    this.file = file; // 새 이미지의 원본 — 손대지 않고 라이브러리에 보관
    this.displayBlob = displayBlob; // 새 이미지의 화면용(정사각형) 버전
  }

  /** 배경이미지 없음 → 채널 기본 배경 이미지를 씁니다. */
  static none() {
    return new ContentCoverChoice({ mode: ContentCoverChoice.MODE.NONE });
  }

  /** 이미 저장된 콘텐츠의 지금 배경이미지를 그대로 둡니다. */
  static keep(item) {
    if (!item?.coverImageUrl) return ContentCoverChoice.none();
    return new ContentCoverChoice({
      mode: ContentCoverChoice.MODE.KEEP,
      previewUrl: item.coverImageUrl,
      assetId: item.coverAssetId,
    });
  }

  /** 라이브러리(내가 올린 것·가져온 공용 자산)에서 고른 이미지. */
  static fromAsset(asset) {
    return new ContentCoverChoice({ mode: ContentCoverChoice.MODE.ASSET, previewUrl: asset.displayUrl, assetId: asset.id });
  }

  /** 새로 올린 이미지 — displayBlob은 ImageSpec.CONTENT_COVER로 맞춘 화면용 버전. */
  static fromNewImage(file, displayBlob) {
    return new ContentCoverChoice({
      mode: ContentCoverChoice.MODE.NEW,
      previewUrl: URL.createObjectURL(displayBlob),
      file,
      displayBlob,
    });
  }

  get hasImage() {
    return this.mode !== ContentCoverChoice.MODE.NONE;
  }

  /** 기존 값에서 바뀌었는지(콘텐츠 관리 탭에서 저장할 필요가 있는지). */
  get isChanged() {
    return this.mode !== ContentCoverChoice.MODE.KEEP;
  }

  /** 실제로 저장하고 콘텐츠에 넣을 값을 돌려줍니다.
   *  {
   *    cover:      서버에 저장할 값 { coverAssetId, coverImageUrl } — 없으면 null
   *    displayUrl: 화면에 바로 보여줄 주소(서버 값이 없을 때는 이 탭에서만 보이는 blob 주소)
   *    archived:   라이브러리에 보관됐는지
   *    reason:     보관하지 못한 이유
   *  }
   *  서버 미연결이거나 채널 구조·라이브러리 마이그레이션(0006·0011·0012) 전이면, 새 이미지는
   *  이 브라우저 탭에서만 보이고 서버에는 저장하지 않습니다(blob 주소를 서버에 남기지 않음). */
  async commit(library, { name }) {
    const { MODE } = ContentCoverChoice;
    if (this.mode === MODE.NONE) return { cover: null, displayUrl: null, archived: true };
    if (this.mode === MODE.KEEP || this.mode === MODE.ASSET) {
      const cover = { coverAssetId: this.assetId, coverImageUrl: this.previewUrl };
      return { cover, displayUrl: this.previewUrl, archived: true };
    }
    if (!isSupabaseConfigured) {
      return { cover: null, displayUrl: this.previewUrl, archived: false, reason: "not-configured" };
    }
    const result = await library.createImageAsset({
      name,
      file: this.file,
      displayBlob: this.displayBlob,
      provenance: new AssetProvenance(),
    });
    if (!result.ok) return { cover: null, displayUrl: this.previewUrl, archived: false, reason: result.reason };
    const cover = { coverAssetId: result.asset.id, coverImageUrl: result.asset.displayUrl };
    return { cover, displayUrl: cover.coverImageUrl, archived: true };
  }
}
