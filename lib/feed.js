"use client";

// 플랫폼 랜딩 페이지의 콘텐츠 구간 — 전체 채널의 나눔을 모아서
// 최신순 / 많이 들은 순 / 내가 자주 듣는 메신저(설교자) 순으로 나눕니다.

import { ChannelArtwork } from "@/lib/channelProfile";

/** 이 브라우저에서 어떤 메신저(설교자)의 나눔을 몇 번 들었는지 기억합니다.
 *  불변 객체라 React 상태에 그대로 넣을 수 있습니다(record()는 새 인스턴스를 돌려줌).
 *  로그인이 붙으면 회원별 서버 기록으로 옮길 수 있도록 같은 인터페이스를 유지합니다. */
export class ListeningHistory {
  static #KEY = "the-line:listening-history-v1";

  #counts;

  constructor(counts = {}) {
    this.#counts = counts;
  }

  /** 브라우저에 저장된 기록을 불러옵니다(서버 렌더링 중이면 빈 기록). */
  static load() {
    if (typeof window === "undefined") return new ListeningHistory();
    try {
      return new ListeningHistory(JSON.parse(window.localStorage.getItem(ListeningHistory.#KEY) || "{}") || {});
    } catch (e) {
      return new ListeningHistory();
    }
  }

  /** 한 번 들었음을 기록한 새 기록을 돌려주고 브라우저에도 저장합니다. */
  record(item) {
    const messenger = item?.pastorName;
    if (!messenger) return this;
    const counts = { ...this.#counts, [messenger]: (this.#counts[messenger] || 0) + 1 };
    try {
      window.localStorage.setItem(ListeningHistory.#KEY, JSON.stringify(counts));
    } catch (e) {
      // 사생활 보호 모드 등 저장 불가 — 이번 방문 동안만 기억합니다.
    }
    return new ListeningHistory(counts);
  }

  get isEmpty() {
    return Object.keys(this.#counts).length === 0;
  }

  /** 많이 들은 메신저 순으로 [이름, 횟수] 목록. */
  topMessengers() {
    return Object.entries(this.#counts).sort((a, b) => b[1] - a[1]);
  }
}

export class FeedSections {
  /** 화면 하나에 보여줄 목록 개수(사용자가 조절). */
  static COUNT_OPTIONS = [5, 10, 20];
  static DEFAULT_COUNT = 10;

  constructor(audios) {
    this.audios = audios;
  }

  static #time(item) {
    return item.createdAt || item.date || "";
  }

  latest(count) {
    return [...this.audios]
      .sort((a, b) => (FeedSections.#time(a) < FeedSections.#time(b) ? 1 : -1))
      .slice(0, count);
  }

  popular(count) {
    return [...this.audios].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, count);
  }

  /** 자주 듣는 메신저의 나눔 — 많이 들은 메신저부터, 같은 메신저 안에서는 최신순.
   *  아직 들은 기록이 없으면 전체 청취수가 많은 메신저 순으로 대신 보여주고,
   *  { personalized: false }로 알려줍니다. */
  favoriteMessengers(history, count) {
    const ranking = history.isEmpty ? this.#messengersByTotalPlays() : history.topMessengers();
    const rank = new Map(ranking.map(([name], i) => [name, i]));
    const items = this.audios
      .filter((a) => rank.has(a.pastorName))
      .sort((a, b) => {
        const byMessenger = rank.get(a.pastorName) - rank.get(b.pastorName);
        if (byMessenger !== 0) return byMessenger;
        return FeedSections.#time(a) < FeedSections.#time(b) ? 1 : -1;
      })
      .slice(0, count);
    return { items, personalized: !history.isEmpty };
  }

  #messengersByTotalPlays() {
    const totals = {};
    for (const a of this.audios) {
      if (!a.pastorName) continue;
      totals[a.pastorName] = (totals[a.pastorName] || 0) + (a.plays || 0);
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }
}

/** 채널별 카드 표지 이미지(ChannelArtwork.thumbnailUrl) — site_settings 행 목록으로 만듭니다.
 *  null이면 카드는 색 그라데이션으로 채웁니다. */
export class ChannelThumbnails {
  static #LEGACY_ROW_ID = "default";

  #byChannelId = new Map();
  #legacy = null;

  constructor(settingsRows = []) {
    for (const row of settingsRows) {
      const url = ChannelArtwork.fromSettingsRow(row).thumbnailUrl;
      if (row.channel_id) this.#byChannelId.set(row.channel_id, url);
      if (row.id === ChannelThumbnails.#LEGACY_ROW_ID) this.#legacy = url;
    }
  }

  /** 콘텐츠 하나의 표지 — 콘텐츠 배경이미지 → 그 채널의 표지. */
  forItem(item) {
    return item.coverImageUrl || this.for(item.channelId);
  }

  /** 채널 구조 적용 전 콘텐츠(channelId 없음)는 기존 단일 사이트 설정을 씁니다. */
  for(channelId) {
    if (!channelId) return this.#legacy;
    return this.#byChannelId.get(channelId) ?? null;
  }
}
