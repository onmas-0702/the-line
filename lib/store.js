"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useChannel } from "@/components/ChannelProvider";
import { ChannelSlug } from "@/lib/channel";
import { ChannelArtwork } from "@/lib/channelProfile";
import { AudioMapper, TrackMapper } from "@/lib/mappers";
import {
  initialAudios,
  initialPersonalTracks,
  officialBackgroundThemes,
} from "@/lib/mockData";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

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
  // 이 채널의 기본 배경 이미지 — 대표이미지·로고가 없을 때 대신 쓰입니다. Supabase가
  // 설정되어 있으면 모든 방문자에게 같은 서버 값이고, 아니면 이 탭에서만 보이는 미리보기.
  const [skinImageUrl, setSkinImageUrlState] = useState(null);
  // 채널 프로필 이미지 — ChannelImageSlot.key별 URL ({ cover: 로고, banner: 대표이미지 }).
  const [channelImages, setChannelImages] = useState({ cover: null, banner: null });
  const [description, setDescriptionState] = useState("");
  const [subscriberCount, setSubscriberCount] = useState(0);

  // Hydrate once on mount — from Supabase if it's configured (the real,
  // shared feed), otherwise from localStorage (wireframe/offline mode).
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const saved = persistence.load();
      if (saved?.pageSize) setPageSizeState(saved.pageSize);

      if (isSupabaseConfigured) {
        const [audioResult, trackResult, skinResult, followerResult] = await Promise.all([
          repos.audios.list(),
          // 'personal'만 불러옵니다 — 다른 창작자가 추가한 공식(official) 트랙이
          // "내 라이브러리" 목록에 섞여 들어오면 안 되기 때문입니다.
          repos.backgroundTracks.list({ libraryType: "personal" }),
          repos.siteSettings.fetch(),
          repos.channels.followerCount(channel.id),
        ]);
        if (cancelled) return;
        if (audioResult.ok) setAudios(audioResult.rows.map(AudioMapper.fromRow));
        if (trackResult.ok) setPersonalTracks(trackResult.rows.map(TrackMapper.fromRow));
        if (skinResult.ok) {
          setSkinImageUrlState(skinResult.url);
          setChannelImages({ cover: skinResult.coverUrl, banner: skinResult.bannerUrl });
          setDescriptionState(skinResult.description);
        }
        setSubscriberCount(followerResult.count);
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
  }, [persistence, repos, channel.id]);

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

  // 배경음악 분류 변경 — 서버에 먼저 반영하고, 성공했을 때만 화면을 바꿉니다.
  const updatePersonalTrackTags = useCallback(
    async (trackId, tags) => {
      if (isSupabaseConfigured) {
        const result = await repos.backgroundTracks.updateTags(trackId, tags);
        if (!result.ok) return result;
      }
      setPersonalTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...tags } : t)));
      return { ok: true };
    },
    [repos]
  );

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

  // 로고·대표이미지. 업로드(서버 반영)는 편집 화면에서 먼저 하고, 여기서는 화면 상태만
  // 갱신합니다(배경 이미지와 같은 방식).
  const setChannelImage = useCallback((slot, url) => {
    setChannelImages((prev) => ({ ...prev, [slot.key]: url }));
  }, []);

  const clearChannelImage = useCallback((slot) => {
    setChannelImages((prev) => ({ ...prev, [slot.key]: null }));
    if (isSupabaseConfigured) {
      repos.siteSettings.clearImage(slot).catch(() => {});
    }
  }, [repos]);

  // 채널 소개글 — Supabase가 설정되어 있으면 서버에도 반영합니다.
  const setDescription = useCallback(async (text) => {
    setDescriptionState(text);
    if (!isSupabaseConfigured) return { ok: true };
    return repos.siteSettings.updateDescription(text);
  }, [repos]);

  // 로고·대표이미지·카드 표지 이미지를 대체 순서까지 반영해 한 번에 꺼내 쓰도록 묶어 둡니다.
  const artwork = useMemo(
    () => new ChannelArtwork({ cover: channelImages.cover, banner: channelImages.banner, skin: skinImageUrl }),
    [channelImages, skinImageUrl]
  );

  const value = useMemo(
    () => ({
      audios,
      isHydrated: hydrated,
      officialBackgroundThemes,
      personalTracks,
      pageSize,
      skinImageUrl,
      channelImages,
      artwork,
      description,
      subscriberCount,
      addAudio,
      addAudioFromRow,
      removeAudioLocal,
      updateAudioLocal,
      addPersonalTrack,
      addPersonalTrackFromRow,
      deletePersonalTrack,
      updatePersonalTrackTags,
      setPageSize,
      setSkinImage,
      resetSkinImage,
      setChannelImage,
      clearChannelImage,
      setDescription,
    }),
    [
      audios,
      hydrated,
      personalTracks,
      pageSize,
      skinImageUrl,
      channelImages,
      artwork,
      description,
      subscriberCount,
      addAudio,
      addAudioFromRow,
      removeAudioLocal,
      updateAudioLocal,
      addPersonalTrack,
      addPersonalTrackFromRow,
      deletePersonalTrack,
      updatePersonalTrackTags,
      setPageSize,
      setSkinImage,
      resetSkinImage,
      setChannelImage,
      clearChannelImage,
      setDescription,
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
