// Supabase 행(snake_case) ↔ 화면에서 쓰는 객체(camelCase) 변환.
// 채널 스토어(lib/store.js)와 플랫폼 랜딩 피드(lib/feed.js)가 함께 씁니다.

import { TimeFormat } from "@/lib/audio";
import { todayLabel } from "@/lib/mockData";

/** audios 테이블 행 → 화면에서 쓰는 나눔 객체. */
export class AudioMapper {
  static fromRow(row) {
    return {
      id: row.id,
      title: row.title,
      pastorName: row.pastor_name || "",
      church: row.church || "",
      date: (row.created_at || "").slice(0, 10),
      createdAt: row.created_at || "",
      channelId: row.channel_id || null,
      coverAssetId: row.cover_asset_id || null,
      coverImageUrl: row.cover_image_url || null,
      duration: TimeFormat.duration(row.duration_seconds),
      plays: row.plays ?? 0,
      hasScript: Boolean(row.has_script),
      scriptFileName: row.script_file_name || "",
      scriptUrl: row.script_url || "",
      previewUrl: row.audio_url,
      scriptureReference: row.scripture_reference || "",
      category: row.category || "",
      tags: row.tags || [],
      description: row.description || "",
    };
  }

  /** Supabase 미설정(로컬 전용) 상태에서 새로 만든 나눔의 기본값. */
  static createLocal(partial) {
    return {
      id: `a${Date.now()}`,
      title: "제목 없는 나눔",
      pastorName: "김은혜 목사",
      church: "새빛교회",
      date: todayLabel(),
      duration: "00:00",
      plays: 0,
      hasScript: false,
      scriptFileName: "",
      ...partial,
    };
  }
}

// 배경음악 트랙 하나(personal 또는 official)를 화면에서 쓰는 형태로 변환합니다.
// genres/themes는 background_tracks 테이블의 태그 배열 컬럼을 그대로 옮겨서,
// TrackRow가 태그 칩을 보여주고 필터가 걸러낼 수 있게 합니다.
export class TrackMapper {
  static fromRow(row) {
    return {
      id: row.id,
      name: row.name,
      duration: row.duration_seconds ? TimeFormat.duration(row.duration_seconds) : "-",
      audioUrl: row.audio_url,
      genres: row.genres || [],
      themes: row.themes || [],
    };
  }

  static createLocal(name, { genres = [], themes = [] } = {}) {
    return { id: `pbg${Date.now()}`, name, duration: "-", genres, themes };
  }
}
