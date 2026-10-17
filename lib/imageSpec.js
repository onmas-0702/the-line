"use client";

// 업로드 이미지 규격 — 고른 이미지를 규격(비율·크기·형식·용량)에 맞게 검사하고,
// 비율이 다르면 가운데를 기준으로 잘라서 맞춘 뒤에 올립니다.

export class ImageSpecError extends Error {}

export class ImageSpec {
  /** 채널 로고(대문이미지) — 채널 페이지의 네모 로고 + 랜딩 콘텐츠 카드 표지. */
  static CHANNEL_COVER = new ImageSpec({
    aspectWidth: 1,
    aspectHeight: 1,
    outputWidth: 800,
    minWidth: 400,
    maxBytes: 10 * 1024 * 1024,
  });

  /** 채널 대표이미지 — 채널 페이지 맨 위의 가로로 긴 배너. 모바일에서도 잘 보이는 3:1. */
  static CHANNEL_BANNER = new ImageSpec({
    aspectWidth: 3,
    aspectHeight: 1,
    outputWidth: 1500,
    minWidth: 900,
    maxBytes: 15 * 1024 * 1024,
  });

  static #ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  constructor({ aspectWidth, aspectHeight, outputWidth, minWidth, maxBytes, quality = 0.88 }) {
    this.aspectWidth = aspectWidth;
    this.aspectHeight = aspectHeight;
    this.outputWidth = outputWidth; // 결과 가로의 최대 길이(px) — 원본이 더 작으면 키우지 않음(흐려짐 방지)
    this.minWidth = minWidth; // 잘라낸 뒤 가로가 이보다 작으면 흐려 보여서 받지 않음
    this.maxBytes = maxBytes; // 원본 파일 최대 용량
    this.quality = quality;
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
    return this.aspectWidth === this.aspectHeight ? "정사각형(1:1)" : `가로형(${this.aspectWidth}:${this.aspectHeight})`;
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
    const image = await ImageSpec.#load(file);
    const crop = this.#cropRect(image.naturalWidth, image.naturalHeight);
    if (crop.width < this.minWidth) {
      throw new ImageSpecError(
        `이미지가 너무 작아요 (${image.naturalWidth}×${image.naturalHeight}px). ${this.minWidth}×${this.#minHeight}px 이상으로 올려주세요.`
      );
    }
    return this.#render(image, crop);
  }

  /** 원본 안에서 규격 비율로 가장 크게 잘라낼 수 있는 가운데 영역. */
  #cropRect(width, height) {
    let cropWidth = width;
    let cropHeight = Math.round(width / this.ratio);
    if (cropHeight > height) {
      cropHeight = height;
      cropWidth = Math.round(height * this.ratio);
    }
    return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
  }

  static #load(file) {
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

  #render(image, crop) {
    const width = Math.min(this.outputWidth, crop.width);
    const height = Math.round(width / this.ratio);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new ImageSpecError("이미지를 변환하지 못했어요."))),
        "image/webp",
        this.quality
      );
    });
  }
}
