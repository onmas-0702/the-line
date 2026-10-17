// 플랫폼 공용 자산 라이브러리 — 운영 채널('은혜의 밤, 더 라인')이 올린 배경음악·
// 배경이미지는 플랫폼 공용 자산이 되고, 다른 채널은 파일을 복사하지 않고 "가져가기"
// (연결)로 자기 라이브러리에 추가해서 씁니다. DB 구조는 0011_asset_library.sql,
// 설계 배경은 docs/multi-channel-architecture.md의 "공용 자산 라이브러리" 참고.
//
// 지금은 설계 뼈대입니다. 라이브러리 화면을 만들 때 기존 background_tracks를 이
// 구조로 옮기고, 배경음악 선택 화면(BackgroundMusicPicker)이 이 저장소를 쓰게 바꿉니다.

import { SupabaseRepository } from "@/lib/supabaseRepository";

export class AssetKind {
  static BACKGROUND_MUSIC = "background_music";
  static BACKGROUND_IMAGE = "background_image";

  static LABELS = {
    [AssetKind.BACKGROUND_MUSIC]: "배경음악",
    [AssetKind.BACKGROUND_IMAGE]: "배경이미지",
  };
}

/** 자산의 출처 증빙 + "공용으로 올려도 되는가" 규칙. DB 트리거
 *  library_assets_check_sharing과 같은 규칙을 화면에서 미리 안내하기 위해 둡니다. */
export class AssetProvenance {
  static SOURCE = Object.freeze({ ORIGINAL: "original", SUNO: "suno", LICENSED: "licensed" });

  // Suno 약관(2026-09-03 시행): 무료 플랜 곡은 비상업적 용도로만 가능하고, 상업적 이용은
  // 유료 플랜에서 정식 다운로드한 곡만 가능합니다. 파일을 제3자에게 넘기거나 접근을 주는
  // 것은 제한되므로 공용 자산이라도 다운로드는 허용하지 않습니다.
  static SUNO_COMMERCIAL_PLANS = ["pro", "premier"];

  constructor({ source = AssetProvenance.SOURCE.ORIGINAL, sourcePlan = null, generatedAt = null, downloadedAt = null, licenseNote = "" } = {}) {
    this.source = source;
    this.sourcePlan = sourcePlan;
    this.generatedAt = generatedAt;
    this.downloadedAt = downloadedAt;
    this.licenseNote = licenseNote;
  }

  static fromRow(row) {
    return new AssetProvenance({
      source: row.source,
      sourcePlan: row.source_plan,
      generatedAt: row.generated_at,
      downloadedAt: row.downloaded_at,
      licenseNote: row.license_note || "",
    });
  }

  get isSuno() {
    return this.source === AssetProvenance.SOURCE.SUNO;
  }

  /** 다운로드를 허용할 수 있는 출처인지. */
  get mayAllowDownload() {
    return !this.isSuno;
  }

  /** 공용으로 올릴 수 없는 이유 목록(없으면 빈 배열). */
  sharingProblems({ allowDownload = false } = {}) {
    const problems = [];
    if (this.isSuno) {
      if (!AssetProvenance.SUNO_COMMERCIAL_PLANS.includes(this.sourcePlan)) {
        problems.push("Suno 곡은 Pro/Premier 요금제로 만든 것만 공용으로 올릴 수 있어요.");
      }
      if (!this.downloadedAt) {
        problems.push("Suno에서 정식으로 다운로드한 날짜를 입력해주세요.");
      }
      if (allowDownload) {
        problems.push("Suno 곡은 약관상 다른 채널의 파일 다운로드를 허용할 수 없어요.");
      }
    }
    if (this.source === AssetProvenance.SOURCE.LICENSED && !this.licenseNote.trim()) {
      problems.push("구매·라이선스 자료는 출처나 라이선스 내용을 적어주세요.");
    }
    return problems;
  }

  toRow() {
    return {
      source: this.source,
      source_plan: this.sourcePlan,
      generated_at: this.generatedAt,
      downloaded_at: this.downloadedAt,
      license_note: this.licenseNote || null,
    };
  }
}

export class LibraryAsset {
  static VISIBILITY = Object.freeze({ SHARED: "shared", PRIVATE: "private" });

  constructor({
    id = null,
    ownerChannelId,
    kind,
    name,
    storagePath = "",
    fileName = "",
    mimeType = "",
    durationSeconds = 0,
    width = null,
    height = null,
    genres = [],
    themes = [],
    visibility = LibraryAsset.VISIBILITY.PRIVATE,
    allowImport = true,
    allowDownload = false,
    status = "active",
    provenance = new AssetProvenance(),
  }) {
    Object.assign(this, {
      id, ownerChannelId, kind, name, storagePath, fileName, mimeType, durationSeconds, width, height,
      genres, themes, visibility, allowImport, allowDownload, status, provenance,
    });
  }

  static fromRow(row) {
    return new LibraryAsset({
      id: row.id,
      ownerChannelId: row.owner_channel_id,
      kind: row.kind,
      name: row.name,
      storagePath: row.storage_path,
      fileName: row.file_name || "",
      mimeType: row.mime_type || "",
      durationSeconds: Number(row.duration_seconds) || 0,
      width: row.width,
      height: row.height,
      genres: row.genres || [],
      themes: row.themes || [],
      visibility: row.visibility,
      allowImport: row.allow_import,
      allowDownload: row.allow_download,
      status: row.status,
      provenance: AssetProvenance.fromRow(row),
    });
  }

  get isShared() {
    return this.visibility === LibraryAsset.VISIBILITY.SHARED && this.status === "active";
  }

  get kindLabel() {
    return AssetKind.LABELS[this.kind] || this.kind;
  }

  toRow() {
    return {
      owner_channel_id: this.ownerChannelId,
      kind: this.kind,
      name: this.name,
      storage_path: this.storagePath,
      file_name: this.fileName || null,
      mime_type: this.mimeType || null,
      duration_seconds: this.durationSeconds || null,
      width: this.width,
      height: this.height,
      genres: this.genres,
      themes: this.themes,
      visibility: this.visibility,
      allow_import: this.allowImport,
      allow_download: this.allowDownload,
      status: this.status,
      ...this.provenance.toRow(),
    };
  }
}

/** 라이브러리 저장소. channelId는 "지금 보고 있는 채널"(내 라이브러리·가져가기 기준). */
export class LibraryRepository extends SupabaseRepository {
  static ASSETS = "library_assets";
  static LINKS = "channel_library_links";
  static BUCKET = "library"; // 비공개 버킷 — 재생·믹싱용 주소는 서명 URL로 발급
  static SIGNED_URL_SECONDS = 60 * 30;

  /** 플랫폼 공용 자산 목록(누구나 볼 수 있음). */
  async listShared({ kind } = {}) {
    if (!this.configured) return this.notConfigured({ assets: [] });
    let query = this.client
      .from(LibraryRepository.ASSETS)
      .select("*")
      .eq("visibility", LibraryAsset.VISIBILITY.SHARED)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (kind) query = query.eq("kind", kind);
    const { data, error } = await query;
    if (error) return SupabaseRepository.fail(error.message, { assets: [] });
    return SupabaseRepository.ok({ assets: data.map(LibraryAsset.fromRow) });
  }

  /** 내 채널 라이브러리 = 내가 올린 자산 + 공용에서 가져온 자산. */
  async listForChannel({ kind } = {}) {
    if (!this.configured || !this.channelId) return this.notConfigured({ owned: [], imported: [] });
    let owned = this.client.from(LibraryRepository.ASSETS).select("*").eq("owner_channel_id", this.channelId);
    if (kind) owned = owned.eq("kind", kind);
    const links = this.client
      .from(LibraryRepository.LINKS)
      .select(`asset:${LibraryRepository.ASSETS}(*)`)
      .eq("channel_id", this.channelId);
    const [ownedResult, linkResult] = await Promise.all([owned, links]);
    if (ownedResult.error || linkResult.error) {
      return SupabaseRepository.fail((ownedResult.error || linkResult.error).message, { owned: [], imported: [] });
    }
    const imported = linkResult.data
      .map((row) => row.asset)
      .filter((row) => row && (!kind || row.kind === kind))
      .map(LibraryAsset.fromRow);
    return SupabaseRepository.ok({ owned: ownedResult.data.map(LibraryAsset.fromRow), imported });
  }

  /** 원본 파일을 그대로 보관하고 자산을 등록합니다(믹싱은 복사본으로만). */
  async create(asset, file) {
    if (!this.configured) return this.notConfigured();
    const ext = SupabaseRepository.safeStorageExtension(file.name);
    const path = this.storagePath(`${asset.kind}/${SupabaseRepository.randomId()}${ext}`);
    const { error: uploadError } = await this.client.storage
      .from(LibraryRepository.BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) return SupabaseRepository.fail(uploadError.message);
    const row = { ...asset.toRow(), storage_path: path, file_name: file.name, mime_type: file.type || null };
    const { data, error } = await this.client.from(LibraryRepository.ASSETS).insert(row).select().single();
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok({ asset: LibraryAsset.fromRow(data) });
  }

  /** 공용 자산은 지우지 않고 숨깁니다. */
  async hide(assetId) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.from(LibraryRepository.ASSETS).update({ status: "hidden" }).eq("id", assetId);
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  /** 공용 자산을 내 채널로 가져가기(연결). */
  async importToChannel(assetId) {
    if (!this.configured || !this.channelId) return this.notConfigured();
    const { error } = await this.client
      .from(LibraryRepository.LINKS)
      .upsert({ channel_id: this.channelId, asset_id: assetId }, { ignoreDuplicates: true });
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  async removeFromChannel(assetId) {
    if (!this.configured || !this.channelId) return this.notConfigured();
    const { error } = await this.client
      .from(LibraryRepository.LINKS)
      .delete()
      .eq("channel_id", this.channelId)
      .eq("asset_id", assetId);
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  /** 재생·믹싱용 짧은 유효기간 주소. 다운로드 버튼에는 쓰지 않습니다. */
  async playbackUrl(asset) {
    if (!this.configured) return this.notConfigured({ url: null });
    const { data, error } = await this.client.storage
      .from(LibraryRepository.BUCKET)
      .createSignedUrl(asset.storagePath, LibraryRepository.SIGNED_URL_SECONDS);
    if (error) return SupabaseRepository.fail(error.message, { url: null });
    return SupabaseRepository.ok({ url: data.signedUrl });
  }
}
