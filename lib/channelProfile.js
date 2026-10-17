"use client";

// 채널 프로필(유튜브 채널 상단처럼 꾸미는 부분) — 대표이미지(배너), 로고, 소개글.
// 교체할 수 있는 이미지 자리 하나하나를 ChannelImageSlot으로 정의해 두고, 업로드 화면
// (채널 페이지의 오버레이 버튼, 제작/관리 → 디자인 탭)이 모두 이 정의를 함께 씁니다.

import { ImageSpec } from "@/lib/imageSpec";

export class ChannelImageSlot {
  /** 채널 로고(= 대문이미지). 채널 페이지의 네모 로고 자리에만 쓰입니다(콘텐츠 카드에는 안 씀). */
  static COVER = new ChannelImageSlot({
    key: "cover",
    label: "로고",
    description: "채널 페이지의 네모 로고 자리에만 쓰여요. 콘텐츠 카드 표지는 콘텐츠마다 고른 배경이미지가 쓰여요.",
    column: "cover_image_url",
    folder: "cover",
    spec: ImageSpec.CHANNEL_COVER,
  });

  /** 채널 대표이미지 — 채널 페이지 맨 위의 가로로 긴 배너. */
  static BANNER = new ChannelImageSlot({
    key: "banner",
    label: "대표이미지",
    description: "채널 페이지 맨 위에 가로로 길게 보이는 이미지예요.",
    column: "banner_image_url",
    folder: "banner",
    spec: ImageSpec.CHANNEL_BANNER,
  });

  constructor({ key, label, description, column, folder, spec }) {
    this.key = key; // 스토어의 channelImages[key]
    this.label = label;
    this.description = description;
    this.column = column; // site_settings 컬럼
    this.folder = folder; // 스토리지 폴더
    this.spec = spec;
  }
}

/** 채널 페이지 콘텐츠 목록의 정렬 + 검색. */
export class ChannelContentQuery {
  static SORTS = [
    { value: "latest", label: "최신순" },
    { value: "popular", label: "인기순" },
    { value: "oldest", label: "날짜순" }, // 오래된 것부터(유튜브의 "날짜순"과 같은 의미)
  ];

  constructor({ sort = "latest", search = "" } = {}) {
    this.sort = sort;
    this.search = search;
  }

  static #time(item) {
    return item.createdAt || item.date || "";
  }

  #matches(item, terms) {
    const haystack = [
      item.title,
      item.pastorName,
      item.church,
      item.scriptureReference,
      item.category,
      item.description,
      ...(item.tags || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  }

  apply(audios) {
    const terms = this.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = terms.length ? audios.filter((a) => this.#matches(a, terms)) : [...audios];
    const byTime = (a, b) => (ChannelContentQuery.#time(a) < ChannelContentQuery.#time(b) ? -1 : 1);
    if (this.sort === "popular") return filtered.sort((a, b) => (b.plays || 0) - (a.plays || 0));
    if (this.sort === "oldest") return filtered.sort(byTime);
    return filtered.sort((a, b) => byTime(b, a));
  }
}

/** 채널 이미지들의 대체 순서를 한 곳에서 정합니다.
 *  로고: 로고 → 기본 배경 이미지 / 대표이미지: 대표이미지 → 기본 배경 이미지
 *  콘텐츠 카드 표지: 콘텐츠 배경이미지 → 기본 배경 이미지 (로고는 로고 자리에만 씁니다).
 *  null이면 화면에서 색 그라데이션으로 채웁니다. */
export class ChannelArtwork {
  constructor({ cover = null, banner = null, skin = null } = {}) {
    this.cover = cover;
    this.banner = banner;
    this.skin = skin;
  }

  static fromSettingsRow(row) {
    return new ChannelArtwork({
      cover: row?.cover_image_url || null,
      banner: row?.banner_image_url || null,
      skin: row?.skin_image_url || null,
    });
  }

  get logoUrl() {
    return this.cover || this.skin;
  }

  get bannerUrl() {
    return this.banner || this.skin;
  }

  /** 콘텐츠 배경이미지가 없을 때 카드 표지로 쓰는 채널 이미지 — 로고가 아니라 기본 배경 이미지. */
  get thumbnailUrl() {
    return this.skin;
  }

  /** 콘텐츠 하나의 표지 — 콘텐츠 배경이미지가 있으면 그것, 없으면 채널 표지. */
  thumbnailFor(item) {
    return item?.coverImageUrl || this.thumbnailUrl;
  }
}
