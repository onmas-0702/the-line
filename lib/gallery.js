"use client";

// 이미지 갤러리 — 플랫폼 메인 하단의 구독자 이미지 다운로드 서비스.
//   · 운영자: 스튜디오 "갤러리" 탭에서 이미지를 올리면, 브라우저에서 화면용·썸네일·
//     모바일 배경이미지를 만들어 원본과 함께 저장합니다(GalleryUpload).
//   · 누구나: 썸네일과 크게 보기.
//   · 구독자: 원본 / 모바일 배경이미지 다운로드, 마이 갤러리(마이 페이지 "갤러리")에 담아두기.
// DB·스토리지 규칙은 supabase/migrations/0019_image_gallery.sql, 권한은 lib/access.js.

import { CropFocus, ImageFileLoader, ImageFit, ImageSpec, ImageSpecError } from "@/lib/imageSpec";
import { SupabaseRepository } from "@/lib/supabaseRepository";
import { BrowserEnvironment } from "@/lib/webApp";

/** 받을 수 있는 버전 — 원본 그대로 / 휴대폰 세로 비율로 맞춘 배경이미지. */
export class GalleryVariant {
  constructor({ key, label, suffix, column }) {
    this.key = key;
    this.label = label;
    this.suffix = suffix; // 내려받는 파일 이름 끝(…_원본.jpg)
    this.column = column; // gallery_images의 경로 컬럼
    Object.freeze(this);
  }

  static ORIGINAL = new GalleryVariant({ key: "original", label: "원본 다운로드", suffix: "원본", column: "original_path" });
  static WALLPAPER = new GalleryVariant({
    key: "wallpaper",
    label: "모바일 배경이미지",
    suffix: "모바일배경",
    column: "wallpaper_path",
  });

  static ALL = Object.freeze([GalleryVariant.ORIGINAL, GalleryVariant.WALLPAPER]);
}

/** 갤러리 이미지 하나(불변). */
export class GalleryImage {
  constructor({
    id,
    channelId = null,
    title = "",
    description = "",
    originalPath,
    wallpaperPath,
    displayUrl,
    thumbUrl,
    originalFileName = "",
    width = null,
    height = null,
    status = "active",
    createdAt = "",
  }) {
    Object.assign(this, {
      id, channelId, title, description, originalPath, wallpaperPath, displayUrl, thumbUrl,
      originalFileName, width, height, status, createdAt,
    });
    Object.freeze(this);
  }

  static fromRow(row) {
    return new GalleryImage({
      id: row.id,
      channelId: row.channel_id,
      title: row.title || "",
      description: row.description || "",
      originalPath: row.original_path,
      wallpaperPath: row.wallpaper_path,
      displayUrl: row.display_url,
      thumbUrl: row.thumb_url,
      originalFileName: row.original_file_name || "",
      width: row.width,
      height: row.height,
      status: row.status,
      createdAt: row.created_at || "",
    });
  }

  get isHidden() {
    return this.status === "hidden";
  }

  get displayTitle() {
    return this.title || "제목 없는 이미지";
  }

  /** 갤러리 크게 보기 주소. */
  get path() {
    return GalleryPaths.image(this.id);
  }

  pathOf(variant) {
    return variant === GalleryVariant.WALLPAPER ? this.wallpaperPath : this.originalPath;
  }

  /** 내려받을 파일 이름 — "더라인_{제목}_{원본|모바일배경}.{확장자}". */
  fileNameFor(variant) {
    const ext = (this.pathOf(variant).match(/\.[a-z0-9]+$/i)?.[0] || ".jpg").toLowerCase();
    const safeTitle = this.displayTitle.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
    return `더라인_${safeTitle}_${variant.suffix}${ext}`;
  }

  withPatch(patch) {
    return new GalleryImage({ ...this, ...patch });
  }
}

export class GalleryPaths {
  static INDEX = "/gallery";

  static image(id) {
    return `${GalleryPaths.INDEX}/${encodeURIComponent(id)}`;
  }
}

/** 운영자가 고른 원본 한 장에서 저장할 파일들을 만듭니다(브라우저 캔버스). */
export class GalleryUpload {
  static ORIGINAL_MAX_BYTES = 30 * 1024 * 1024;
  // 최소 해상도 1024×768 — 가로·세로 방향과 상관없이 긴 변 1024px, 짧은 변 768px 이상.
  static MIN_LONG_SIDE = 1024;
  static MIN_SHORT_SIDE = 768;

  /** 크게 보기용 — 비율 유지, 긴 변 1600px. */
  static DISPLAY = new ImageFit({ maxSide: 1600 });
  /** 갤러리 썸네일 — 정사각형 480px. */
  static THUMB = new ImageSpec({ aspectWidth: 1, aspectHeight: 1, outputWidth: 480, minWidth: 200, maxBytes: Infinity });
  /** 모바일 배경이미지 — 요즘 휴대폰 세로 비율(1170×2532), 어디서나 열리게 JPG. */
  static WALLPAPER = new ImageSpec({
    aspectWidth: 1170,
    aspectHeight: 2532,
    outputWidth: 1170,
    // 1024×768 가로 사진에서 세로로 잘라내면 폭이 약 355px이라, 그보다 조금 낮게 둡니다.
    minWidth: 340,
    maxBytes: Infinity,
    quality: 0.92,
    type: "image/jpeg",
  });

  static get acceptAttribute() {
    return ImageFileLoader.ACCEPTED_TYPES.join(",");
  }

  static get guide() {
    return [
      "JPG · PNG · WebP, 30MB 이하, 1024×768px 이상(세로 사진은 768×1024px 이상)",
      "원본은 그대로 보관해서 구독자가 원본으로 받아요",
      "모바일 배경이미지는 휴대폰 세로 비율(1170×2532)로 잘라 함께 만들어요 — 잘라낼 위치는 직접 옮길 수 있어요",
    ];
  }

  /** source: 불러온 원본 이미지 요소(배경 위치를 옮겨 다시 자를 때 씀), wallpaperFocus: 배경 자를 위치(CropFocus) */
  constructor({ original, display, thumb, wallpaper, width, height, source = null, wallpaperFocus = CropFocus.CENTER }) {
    Object.assign(this, { original, display, thumb, wallpaper, width, height, source, wallpaperFocus });
    Object.freeze(this);
  }

  /** 배경 위치를 바꾼 새 GalleryUpload(배경이미지만 다시 자름) */
  async withWallpaperFocus(focus) {
    if (!this.source) return this;
    const wallpaper = await GalleryUpload.WALLPAPER.renderFrom(this.source, focus);
    return new GalleryUpload({ ...this, wallpaper, wallpaperFocus: focus });
  }

  /** 원본 파일을 검사하고 화면용·썸네일·배경이미지를 만듭니다. 규격이 안 맞으면 ImageSpecError. */
  static async prepare(file) {
    if (!ImageFileLoader.ACCEPTED_TYPES.includes(file.type)) {
      throw new ImageSpecError("JPG, PNG, WebP 이미지만 올릴 수 있어요.");
    }
    if (file.size > GalleryUpload.ORIGINAL_MAX_BYTES) {
      throw new ImageSpecError("이미지 용량이 너무 커요. 30MB 이하로 올려주세요.");
    }
    const image = await ImageFileLoader.load(file);
    const { naturalWidth: width, naturalHeight: height } = image;
    if (Math.max(width, height) < GalleryUpload.MIN_LONG_SIDE || Math.min(width, height) < GalleryUpload.MIN_SHORT_SIDE) {
      throw new ImageSpecError(`이미지가 너무 작아요 (${width}×${height}px). 1024×768px 이상으로 올려주세요.`);
    }
    const [display, thumb, wallpaper] = await Promise.all([
      GalleryUpload.DISPLAY.render(image),
      GalleryUpload.THUMB.renderFrom(image),
      GalleryUpload.WALLPAPER.renderFrom(image),
    ]);
    return new GalleryUpload({ original: file, display, thumb, wallpaper, width, height, source: image });
  }
}

/** 이미 올린 이미지의 모바일 배경 위치 다시 잡기 — 원본을 받아 와 새 위치로 잘라 배경이미지 파일만 바꿉니다. */
export class WallpaperReframe {
  constructor({ image, source }) {
    this.image = image; // GalleryImage
    this.source = source; // 불러온 원본 이미지 요소
    Object.freeze(this);
  }

  /** → { ok, reframe } | { ok: false, reason } */
  static async open(repository, image) {
    const signed = await repository.downloadUrl(image, GalleryVariant.ORIGINAL, { attachment: false });
    if (!signed.ok) return signed;
    try {
      const response = await fetch(signed.url);
      if (!response.ok) throw new Error(String(response.status));
      const source = await ImageFileLoader.load(await response.blob());
      return { ok: true, reframe: new WallpaperReframe({ image, source }) };
    } catch {
      return { ok: false, reason: "원본 이미지를 불러오지 못했어요" };
    }
  }

  /** 새 위치로 자른 배경이미지 Blob */
  render(focus) {
    return GalleryUpload.WALLPAPER.renderFrom(this.source, focus);
  }
}

/** 갤러리 저장소. channelId는 이미지를 올리는 채널(운영 채널) — 목록 읽기는 채널 구분 없이. */
export class GalleryRepository extends SupabaseRepository {
  static TABLE = "gallery_images";
  static PRIVATE_BUCKET = "gallery"; // 원본·모바일 배경이미지(구독자만 서명 URL로)
  static PUBLIC_BUCKET = "gallery-display"; // 크게 보기·썸네일
  static SIGNED_URL_SECONDS = 60 * 5;

  /** 공개된 이미지 목록(최신순). includeHidden: 스튜디오에서 숨긴 것까지. */
  async list({ includeHidden = false, limit = null } = {}) {
    if (!this.configured) return this.notConfigured({ images: [] });
    let query = this.client.from(GalleryRepository.TABLE).select("*").order("created_at", { ascending: false });
    if (!includeHidden) query = query.eq("status", "active");
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) return SupabaseRepository.fail(error.message, { images: [] });
    return SupabaseRepository.ok({ images: data.map(GalleryImage.fromRow) });
  }

  /** 준비된 GalleryUpload를 올리고 등록합니다. */
  async create({ title = "", description = "", upload }) {
    if (!this.configured) return this.notConfigured();
    if (!this.channelId) return SupabaseRepository.fail("채널 정보가 없어요");
    const id = SupabaseRepository.randomId();
    const folder = this.storagePath(`gallery/${id}`);
    const originalExt = SupabaseRepository.safeStorageExtension(upload.original.name) || ".jpg";
    const originalPath = `${folder}/original${originalExt}`;
    const wallpaperPath = `${folder}/wallpaper.jpg`;

    const privateUploads = await Promise.all([
      this.#uploadPrivate(originalPath, upload.original),
      this.#uploadPrivate(wallpaperPath, upload.wallpaper),
    ]);
    const failedPrivate = privateUploads.find((r) => !r.ok);
    if (failedPrivate) return failedPrivate;

    const [display, thumb] = await Promise.all([
      this.uploadFile(GalleryRepository.PUBLIC_BUCKET, `${folder}/display.webp`, upload.display, { contentType: "image/webp" }),
      this.uploadFile(GalleryRepository.PUBLIC_BUCKET, `${folder}/thumb.webp`, upload.thumb, { contentType: "image/webp" }),
    ]);
    if (!display.ok) return display;
    if (!thumb.ok) return thumb;

    const { data, error } = await this.client
      .from(GalleryRepository.TABLE)
      .insert({
        id,
        channel_id: this.channelId,
        title: title.trim(),
        description: description.trim() || null,
        original_path: originalPath,
        wallpaper_path: wallpaperPath,
        display_url: display.url,
        thumb_url: thumb.url,
        original_file_name: upload.original.name,
        width: upload.width,
        height: upload.height,
      })
      .select()
      .single();
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok({ image: GalleryImage.fromRow(data) });
  }

  async #uploadPrivate(path, blob) {
    const { error } = await this.client.storage
      .from(GalleryRepository.PRIVATE_BUCKET)
      .upload(path, blob, { upsert: false, contentType: blob.type || undefined });
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  /** 모바일 배경이미지 파일만 새로 바꿔 넣기(같은 경로에 덮어씀) */
  async replaceWallpaper(image, blob) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.storage
      .from(GalleryRepository.PRIVATE_BUCKET)
      .upload(image.wallpaperPath, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  /** 제목·설명·공개 여부 바꾸기. 권한이 없으면 오류 없이 0건만 바뀌므로 그것도 실패로 알립니다. */
  async update(id, { title, description, status }) {
    if (!this.configured) return this.notConfigured();
    const patch = {};
    if (title !== undefined) patch.title = title.trim();
    if (description !== undefined) patch.description = description.trim() || null;
    if (status !== undefined) patch.status = status;
    const { data, error } = await this.client.from(GalleryRepository.TABLE).update(patch).eq("id", id).select();
    if (error) return SupabaseRepository.fail(error.message);
    if (!data?.length) return SupabaseRepository.fail("수정 권한이 없어요");
    return SupabaseRepository.ok({ image: GalleryImage.fromRow(data[0]) });
  }

  /** 완전히 지우기 — 파일과 마이 갤러리에 담긴 기록까지 함께 사라집니다. */
  async remove(image) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.from(GalleryRepository.TABLE).delete().eq("id", image.id);
    if (error) return SupabaseRepository.fail(error.message);
    const folder = image.originalPath.replace(/\/[^/]+$/, "");
    await Promise.all([
      this.client.storage.from(GalleryRepository.PRIVATE_BUCKET).remove([image.originalPath, image.wallpaperPath]),
      this.client.storage.from(GalleryRepository.PUBLIC_BUCKET).remove([`${folder}/display.webp`, `${folder}/thumb.webp`]),
    ]);
    return SupabaseRepository.ok();
  }

  /** 원본·모바일 배경이미지를 받을 짧은 유효기간 주소 — 구독자가 아니면 DB 정책이 막습니다.
   *  attachment: true면 열자마자 파일로 저장되는 주소, false면 이미지가 화면에 열리는 주소. */
  async downloadUrl(image, variant, { attachment = true } = {}) {
    if (!this.configured) return this.notConfigured({ url: null });
    const { data, error } = await this.client.storage
      .from(GalleryRepository.PRIVATE_BUCKET)
      .createSignedUrl(
        image.pathOf(variant),
        GalleryRepository.SIGNED_URL_SECONDS,
        attachment ? { download: image.fileNameFor(variant) } : undefined
      );
    if (error || !data?.signedUrl) return SupabaseRepository.fail(error?.message || "주소를 만들지 못했어요", { url: null });
    return SupabaseRepository.ok({ url: data.signedUrl });
  }
}

/** 마이 갤러리 — 구독자가 담아둔 이미지(마이 페이지 "갤러리"). */
export class MyGalleryRepository extends SupabaseRepository {
  static TABLE = "gallery_saves";

  async listMine(userId) {
    if (!this.configured) return this.notConfigured({ images: [] });
    const { data, error } = await this.client
      .from(MyGalleryRepository.TABLE)
      .select("created_at, image:gallery_images(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return SupabaseRepository.fail(error.message, { images: [] });
    return SupabaseRepository.ok({
      images: data.filter((row) => row.image && row.image.status === "active").map((row) => GalleryImage.fromRow(row.image)),
    });
  }

  async isSaved(imageId, userId) {
    if (!this.configured || !userId) return SupabaseRepository.ok({ saved: false });
    const { data, error } = await this.client
      .from(MyGalleryRepository.TABLE)
      .select("image_id")
      .eq("user_id", userId)
      .eq("image_id", imageId)
      .maybeSingle();
    if (error) return SupabaseRepository.fail(error.message, { saved: false });
    return SupabaseRepository.ok({ saved: Boolean(data) });
  }

  async set({ imageId, userId, saved }) {
    if (!this.configured) return this.notConfigured();
    const query = saved
      ? this.client
          .from(MyGalleryRepository.TABLE)
          .upsert({ user_id: userId, image_id: imageId }, { onConflict: "user_id,image_id" })
      : this.client.from(MyGalleryRepository.TABLE).delete().eq("user_id", userId).eq("image_id", imageId);
    const { error } = await query;
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }
}

/** 원본·모바일 배경이미지 받기 — 브라우저에 맞는 방법을 고릅니다.
 *  · 휴대폰: 공유 창(사진 앱에 바로 저장 가능)
 *  · 컴퓨터: 파일 다운로드
 *  · 카카오톡 등 앱 안 브라우저: 파일 저장이 막혀 있어서, 이미지를 화면에 열고 길게 눌러
 *    저장하게 합니다(Result.OPENED — 화면에서 안내 문구를 보여주세요). */
export class GalleryDownloader {
  static Result = Object.freeze({ SHARED: "shared", DOWNLOADED: "downloaded", OPENED: "opened", CANCELED: "canceled" });

  constructor(repository, win = window) {
    this.repository = repository;
    this.window = win;
    this.env = new BrowserEnvironment(win);
  }

  /** { ok, result, reason } */
  async download(image, variant) {
    const inApp = Boolean(this.env.inApp);
    const signed = await this.repository.downloadUrl(image, variant, { attachment: !inApp });
    if (!signed.ok) return signed;
    if (inApp) {
      this.window.location.assign(signed.url);
      return { ok: true, result: GalleryDownloader.Result.OPENED };
    }
    return { ok: true, result: await this.#save(signed.url, image.fileNameFor(variant)) };
  }

  async #save(url, fileName) {
    const { Result } = GalleryDownloader;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });

      if (this.env.isMobile && this.window.navigator.canShare?.({ files: [file] })) {
        try {
          await this.window.navigator.share({ files: [file], title: fileName });
          return Result.SHARED;
        } catch (err) {
          if (err?.name === "AbortError") return Result.CANCELED;
          // 공유가 막힌 환경이면 아래 파일 다운로드로 이어갑니다.
        }
      }

      const objectUrl = URL.createObjectURL(file);
      const link = this.window.document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      this.window.document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
      return Result.DOWNLOADED;
    } catch (err) {
      // 받기에 실패하면 서명 주소(다운로드형)로 직접 이동해 브라우저가 받게 합니다.
      this.window.location.assign(url);
      return Result.OPENED;
    }
  }
}
