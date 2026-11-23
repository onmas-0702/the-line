"use client";

// 업로드 이미지 규격 — 고른 이미지를 규격(비율·크기·형식·용량)에 맞게 검사하고,
// 비율이 다르면 가운데를 기준으로 잘라서 맞춘 뒤에 올립니다.

export class ImageSpecError extends Error {}

/** 잘라낼 위치 — 원본 안에서 잘라낼 틀이 움직일 수 있는 범위 중 어디인지(0 = 왼쪽·위 끝, 0.5 = 가운데, 1 = 오른쪽·아래 끝). 불변. */
export class CropFocus {
  constructor({ x = 0.5, y = 0.5 } = {}) {
    this.x = CropFocus.#clamp(x);
    this.y = CropFocus.#clamp(y);
    Object.freeze(this);
  }

  static CENTER = new CropFocus();

  static #clamp(v) {
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
  }

  withX(x) {
    return new CropFocus({ x, y: this.y });
  }

  withY(y) {
    return new CropFocus({ x: this.x, y });
  }

  /** 틀을 원본 픽셀로 (dx, dy)만큼 끌었을 때의 새 위치 — crop: 지금 틀(cropRect 결과) */
  shiftedBy({ dx = 0, dy = 0, width, height, crop }) {
    const rangeX = width - crop.width;
    const rangeY = height - crop.height;
    return new CropFocus({
      x: rangeX > 0 ? this.x + dx / rangeX : this.x,
      y: rangeY > 0 ? this.y + dy / rangeY : this.y,
    });
  }

  get isCenter() {
    return Math.abs(this.x - 0.5) < 1e-3 && Math.abs(this.y - 0.5) < 1e-3;
  }
}

/** 파일 → 이미지 요소, 캔버스 → Blob. 이미지 규격 클래스들이 함께 씁니다. */
export class ImageFileLoader {
  static ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  static load(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new ImageSpecError("이미지를 읽을 수 없어요. 다른 파일로 시도해주세요."));
      };
      image.src = url;
    });
  }

  /** 이미지의 (sx,sy,sw,sh) 영역을 width×height로 그려 Blob으로. */
  static render(image, { sx = 0, sy = 0, sw, sh, width, height, type = "image/webp", quality = 0.88 }) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, sx, sy, sw ?? image.naturalWidth, sh ?? image.naturalHeight, 0, 0, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new ImageSpecError("이미지를 변환하지 못했어요."))),
        type,
        quality
      );
    });
  }
}

/** 비율은 그대로 두고 긴 변만 maxSide 이하로 줄입니다(작으면 그대로). 크게 보기용 화면 이미지 등. */
export class ImageFit {
  constructor({ maxSide, type = "image/webp", quality = 0.88 }) {
    this.maxSide = maxSide;
    this.type = type;
    this.quality = quality;
  }

  /** image: 이미 불러온 이미지 요소(ImageFileLoader.load). */
  render(image) {
    const scale = Math.min(1, this.maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    return ImageFileLoader.render(image, {
      width: Math.round(image.naturalWidth * scale),
      height: Math.round(image.naturalHeight * scale),
      type: this.type,
      quality: this.quality,
    });
  }
}

export class ImageSpec {
  /** 채널 로고(대문이미지) — 채널 페이지의 네모 로고. */
  static CHANNEL_COVER = new ImageSpec({
    aspectWidth: 1,
    aspectHeight: 1,
    outputWidth: 800,
    minWidth: 400,
    maxBytes: 10 * 1024 * 1024,
  });

  /** 콘텐츠 배경이미지의 화면용 버전 — 카드 표지·재생 바(정사각형). 원본은 따로 보관. */
  static CONTENT_COVER = new ImageSpec({
    aspectWidth: 1,
    aspectHeight: 1,
    outputWidth: 800,
    minWidth: 400,
    maxBytes: 20 * 1024 * 1024,
  });

  /** 채널 대표이미지 — 채널 페이지 맨 위의 가로로 긴 배너. 모바일에서도 잘 보이는 3:1. */
  static CHANNEL_BANNER = new ImageSpec({
    aspectWidth: 3,
    aspectHeight: 1,
    outputWidth: 1500,
    minWidth: 900,
    maxBytes: 15 * 1024 * 1024,
  });

  static #ACCEPTED_TYPES = ImageFileLoader.ACCEPTED_TYPES;

  constructor({ aspectWidth, aspectHeight, outputWidth, minWidth, maxBytes, quality = 0.88, type = "image/webp" }) {
    this.aspectWidth = aspectWidth;
    this.aspectHeight = aspectHeight;
    this.outputWidth = outputWidth; // 결과 가로의 최대 길이(px) — 원본이 더 작으면 키우지 않음(흐려짐 방지)
    this.minWidth = minWidth; // 잘라낸 뒤 가로가 이보다 작으면 흐려 보여서 받지 않음
    this.maxBytes = maxBytes; // 원본 파일 최대 용량
    this.quality = quality;
    this.type = type; // 결과 형식 — 휴대폰 배경화면처럼 어디서나 열려야 하면 image/jpeg
  }

  get ratio() {
    return this.aspectWidth / this.aspectHeight;
  }

  get #outputHeight() {
    return Math.round(this.outputWidth / this.ratio);
  }

  get #minHeight() {
    return Math.round(this.minWidth / this.ratio);
  }

  get ratioLabel() {
    if (this.aspectWidth === this.aspectHeight) return "정사각형(1:1)";
    const kind = this.aspectWidth > this.aspectHeight ? "가로형" : "세로형";
    return `${kind}(${this.aspectWidth}:${this.aspectHeight})`;
  }

  get acceptAttribute() {
    return ImageSpec.#ACCEPTED_TYPES.join(",");
  }

  /** 화면에 보여줄 안내 문구. */
  get guide() {
    return [
      `${this.ratioLabel}으로 저장돼요 (최대 ${this.outputWidth}×${this.#outputHeight}px)`,
      `원본은 ${this.minWidth}×${this.#minHeight}px 이상, ${Math.round(this.maxBytes / 1024 / 1024)}MB 이하`,
      "형식: JPG · PNG · WebP",
      "비율이 다르면 가운데를 기준으로 잘라서 맞춰요",
    ];
  }

  /** 파일을 검사하고 비율에 맞게 잘라 리사이즈한 Blob을 돌려줍니다.
   *  규격에 맞지 않으면 ImageSpecError(사용자에게 보여줄 문구)를 던집니다. */
  async process(file) {
    if (!ImageSpec.#ACCEPTED_TYPES.includes(file.type)) {
      throw new ImageSpecError("JPG, PNG, WebP 이미지만 올릴 수 있어요.");
    }
    if (file.size > this.maxBytes) {
      throw new ImageSpecError(`이미지 용량이 너무 커요. ${Math.round(this.maxBytes / 1024 / 1024)}MB 이하로 올려주세요.`);
    }
    return this.renderFrom(await ImageFileLoader.load(file));
  }

  /** 이미 불러온 이미지로 바로 만듭니다(한 파일에서 여러 규격을 뽑을 때). */
  async renderFrom(image, focus = CropFocus.CENTER) {
    const crop = this.cropRect(image.naturalWidth, image.naturalHeight, focus);
    if (crop.width < this.minWidth) {
      throw new ImageSpecError(
        `이미지가 너무 작아요 (${image.naturalWidth}×${image.naturalHeight}px). ${this.minWidth}×${this.#minHeight}px 이상으로 올려주세요.`
      );
    }
    return this.#render(image, crop);
  }

  /** 원본 안에서 규격 비율로 가장 크게 잘라낼 수 있는 영역 — 위치는 focus(기본 가운데). */
  cropRect(width, height, focus = CropFocus.CENTER) {
    let cropWidth = width;
    let cropHeight = Math.round(width / this.ratio);
    if (cropHeight > height) {
      cropHeight = height;
      cropWidth = Math.round(height * this.ratio);
    }
    return {
      x: Math.round((width - cropWidth) * focus.x),
      y: Math.round((height - cropHeight) * focus.y),
      width: cropWidth,
      height: cropHeight,
    };
  }

  #render(image, crop) {
    const width = Math.min(this.outputWidth, crop.width);
    const height = Math.round(width / this.ratio);
    return ImageFileLoader.render(image, {
      sx: crop.x,
      sy: crop.y,
      sw: crop.width,
      sh: crop.height,
      width,
      height,
      type: this.type,
      quality: this.quality,
    });
  }
}
