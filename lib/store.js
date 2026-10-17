"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TimeFormat } from "@/lib/audio";
import { useChannel } from "@/components/ChannelProvider";
import { ChannelSlug } from "@/lib/channel";
import {
  initialAudios,
  initialPersonalTracks,
  officialBackgroundThemes,
  todayLabel,
} from "@/lib/mockData";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const DEFAULT_TEXT_COLOR = "#ffffff";
const DEFAULT_PAGE_SIZE = 5;

const AppStoreContext = createContext(null);

/** 이 브라우저에만 남기는 localStorage 영속화. */
class LocalPersistence {
  constructor(key) {
    this.key = key;
  }

  load() {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  save(data) {
    if (typeof window === "undefined") return;
    try {
      // previewUrl is a blob: object URL that only lives for this page's
      // lifetime — persisting it would leave a dead link after reload, so
      // we keep it in live React state only and drop it before saving.
      const sanitized = { ...data };
      if (sanitized.audios) {
        sanitized.audios = sanitized.audios.map(({ previewUrl, ...rest }) => rest);
      }
      window.localStorage.setItem(this.key, JSON.stringify(sanitized));
    } catch (e) {
      // ignore quota / privacy-mode errors — wireframe only
    }
  }
}

// 채널마다 따로 보관합니다. 기본 채널은 예전 키를 그대로 써서 이미 이 브라우저에
// 저장돼 있던 데이터가 사라지지 않게 합니다.
const LEGACY_STORAGE_KEY = "eunhye-the-line-store-v2";

function persistenceFor(slug) {
  return new LocalPersistence(
    slug === ChannelSlug.DEFAULT ? LEGACY_STORAGE_KEY : `${LEGACY_STORAGE_KEY}:${slug}`
  );
}

/** audios 테이블 행 → 화면에서 쓰는 나눔 객체. */
class AudioMapper {
  static fromRow(row) {
    return {
      id: row.id,
      title: row.title,
      pastorName: row.pastor_name || "",
      church: row.church || "",
      date: (row.created_at || "").slice(0, 10),
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
class TrackMapper {
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

// 채널 하나의 화면 상태(피드·배경음악 라이브러리·디자인). ChannelProvider 안에서만
// 쓰이고, 모든 서버 호출은 그 채널로 한정된 저장소(repos)를 거칩니다.
export function AppStoreProvider({ children }) {
  const { channel, repos } = useChannel();
  const persistence = useMemo(() => persistenceFor(channel.slug), [channel.slug]);
  // 와이어프레임용 샘플 데이터는 기본 채널(채널 A)에만 보여주고, 새로 생긴 채널은
  // 빈 상태에서 시작합니다.
  const isDefaultChannel = channel.slug === ChannelSlug.DEFAULT;
  const [audios, setAudios] = useState(isDefaultChannel ? initialAudios : []);
  const [personalTracks, setPersonalTracks] = useState(isDefaultChannel ? initialPersonalTracks : []);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [hydrated, setHydrated] = useState(false);
  // 이 채널의 배경 스킨 이미지 URL. Supabase가 설정되어 있으면 모든 방문자에게
  // 동일하게 보이는 서버 값이고, 아니면 이 브라우저 탭에서만 보이는 임시 미리보기입니다.
  const [skinImageUrl, setSkinImageUrlState] = useState(null);
  // 홈 화면에서 배경 이미지 위에 얹히는 글자 색 — "디자인 적용" 탭에서 바꿀 수
  // 있습니다(기본값은 흰색).
  const [textColor, setTextColorState] = useState(DEFAULT_TEXT_COLOR);

  // Hydrate once on mount — from Supabase if it's configured (the real,
  // shared feed), otherwise from localStorage (wireframe/offline mode).
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const saved = persistence.load();
      if (saved?.pageSize) setPageSizeState(saved.pageSize);

      if (isSupabaseConfigured) {
        const [audioResult, trackResult, skinResult] = await Promise.all([
          repos.audios.list(),
          // 'personal'만 불러옵니다 — 다른 창작자가 추가한 공식(official) 트랙이
          // "내 라이브러리" 목록에 섞여 들어오면 안 되기 때문입니다.
          repos.backgroundTracks.list({ libraryType: "personal" }),
          repos.siteSettings.fetch(),
        ]);
        if (cancelled) return;
        if (audioResult.ok) setAudios(audioResult.rows.map(AudioMapper.fromRow));
        if (trackResult.ok) setPersonalTracks(trackResult.rows.map(TrackMapper.fromRow));
        if (skinResult.ok) {
          setSkinImageUrlState(skinResult.url);
          setTextColorState(skinResult.textColor || DEFAULT_TEXT_COLOR);
        }
        setHydrated(true);
        return;
      }

      if (saved) {
        if (saved.audios) setAudios(saved.audios);
        if (saved.personalTracks) setPersonalTracks(saved.personalTracks);
      }
      setHydrated(true);
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [persistence, repos]);

  useEffect(() => {
    if (!hydrated) return;
    // Once Supabase is the source of truth, don't let a stale local copy
    // of the shared feed shadow it — only the per-browser pageSize
    // preference still belongs in localStorage. The skin image is never
    // persisted to localStorage: with Supabase it lives in site_settings,
    // and without Supabase it's a blob: preview that dies with the tab.
    const dataToSave = isSupabaseConfigured
      ? { pageSize }
      : { audios, personalTracks, pageSize };
    persistence.save(dataToSave);
  }, [audios, personalTracks, pageSize, hydrated, persistence]);

  // Local-only fallback (used when Supabase isn't configured yet).
  const addAudio = useCallback((partial) => {
    const newAudio = AudioMapper.createLocal(partial);
    setAudios((prev) => [newAudio, ...prev]);
    return newAudio.id;
  }, []);

  // 실제 경로 — 이미 Supabase에 insert된 행을 매핑해서 피드 맨 앞에 바로 붙입니다
  // (다시 전체를 불러올 필요 없는 optimistic UI).
  const addAudioFromRow = useCallback((row) => {
    setAudios((prev) => [AudioMapper.fromRow(row), ...prev]);
  }, []);

  // "제작/관리 → 콘텐츠 관리"에서 씁니다. 실제 삭제/수정 요청(Supabase 호출)은
  // 패널 쪽에서 먼저 하고, 성공했을 때만 이 함수들로 화면 상태를 갱신합니다
  // (서버에 반영 안 됐는데 화면에서만 사라지는 걸 막기 위함).
  const removeAudioLocal = useCallback((id) => {
    setAudios((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const updateAudioLocal = useCallback((id, partial) => {
    setAudios((prev) => prev.map((a) => (a.id === id ? { ...a, ...partial } : a)));
  }, []);

  const addPersonalTrack = useCallback((name, { genres = [], themes = [] } = {}) => {
    setPersonalTracks((prev) => [...prev, TrackMapper.createLocal(name, { genres, themes })]);
  }, []);

  const addPersonalTrackFromRow = useCallback((row) => {
    setPersonalTracks((prev) => [...prev, TrackMapper.fromRow(row)]);
  }, []);

  const deletePersonalTrack = useCallback((trackId) => {
    setPersonalTracks((prev) => prev.filter((t) => t.id !== trackId));
    if (isSupabaseConfigured) {
      repos.backgroundTracks.delete(trackId).catch(() => {});
    }
  }, [repos]);

  const setPageSize = useCallback((n) => {
    setPageSizeState(Number(n));
  }, []);

  // "디자인 적용" 탭에서 씁니다. url이 이미 Supabase에 업로드되어 반영된 상태라면
  // 그냥 화면 상태만 갱신하면 되고(서버 반영은 siteSettings.js 쪽에서 이미 끝남),
  // Supabase 미설정 상태라면 이 함수 하나가 곧 "적용"입니다(이 탭에서만 보임).
  const setSkinImage = useCallback((url) => {
    setSkinImageUrlState(url);
  }, []);

  const resetSkinImage = useCallback(() => {
    setSkinImageUrlState(null);
    if (isSupabaseConfigured) {
      repos.siteSettings.clearSkinImage().catch(() => {});
    }
  }, [repos]);

  // 홈 화면 글자색 변경 — Supabase가 설정되어 있으면 서버에도 반영해서 모든
  // 방문자에게 동일하게 보이고, 아니면 이 브라우저 탭에서만 적용됩니다.
  const setTextColor = useCallback((color) => {
    setTextColorState(color);
    if (isSupabaseConfigured) {
      repos.siteSettings.updateTextColor(color).catch(() => {});
    }
  }, [repos]);

  const value = useMemo(
    () => ({
      audios,
      officialBackgroundThemes,
      personalTracks,
      pageSize,
      skinImageUrl,
      textColor,
      addAudio,
      addAudioFromRow,
      removeAudioLocal,
      updateAudioLocal,
      addPersonalTrack,
      addPersonalTrackFromRow,
      deletePersonalTrack,
      setPageSize,
      setSkinImage,
      resetSkinImage,
      setTextColor,
    }),
    [
      audios,
      personalTracks,
      pageSize,
      skinImageUrl,
      textColor,
      addAudio,
      addAudioFromRow,
      removeAudioLocal,
      updateAudioLocal,
      addPersonalTrack,
      addPersonalTrackFromRow,
      deletePersonalTrack,
      setPageSize,
      setSkinImage,
      resetSkinImage,
      setTextColor,
    ]
  );

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }
  return ctx;
}
