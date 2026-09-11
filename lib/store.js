"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { formatDuration } from "@/lib/audio";
import {
  deleteBackgroundTrack as deleteBackgroundTrackRemote,
  fetchAudios,
  fetchBackgroundTracks,
} from "@/lib/audioStorage";
import {
  initialAudios,
  initialPersonalTracks,
  officialBackgroundThemes,
  todayLabel,
} from "@/lib/mockData";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const STORAGE_KEY = "eunhye-the-line-store-v2";
const DEFAULT_PAGE_SIZE = 5;

const AppStoreContext = createContext(null);

function loadFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveToStorage(data) {
  if (typeof window === "undefined") return;
  try {
    // previewUrl is a blob: object URL that only lives for this page's
    // lifetime — persisting it would leave a dead link after reload, so
    // we keep it in live React state only and drop it before saving.
    const sanitized = { ...data };
    if (sanitized.audios) {
      sanitized.audios = sanitized.audios.map(({ previewUrl, ...rest }) => rest);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (e) {
    // ignore quota / privacy-mode errors — wireframe only
  }
}

function mapAudioRow(row) {
  return {
    id: row.id,
    title: row.title,
    pastorName: row.pastor_name || "",
    church: row.church || "",
    date: (row.created_at || "").slice(0, 10),
    duration: formatDuration(row.duration_seconds),
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

function mapTrackRow(row) {
  return {
    id: row.id,
    name: row.name,
    duration: row.duration_seconds ? formatDuration(row.duration_seconds) : "-",
    audioUrl: row.audio_url,
  };
}

export function AppStoreProvider({ children }) {
  const [audios, setAudios] = useState(initialAudios);
  const [personalTracks, setPersonalTracks] = useState(initialPersonalTracks);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once on mount — from Supabase if it's configured (the real,
  // shared feed), otherwise from localStorage (wireframe/offline mode).
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const saved = loadFromStorage();
      if (saved?.pageSize) setPageSizeState(saved.pageSize);

      if (isSupabaseConfigured) {
        const [audioResult, trackResult] = await Promise.all([
          fetchAudios(),
          fetchBackgroundTracks(),
        ]);
        if (cancelled) return;
        if (audioResult.ok) setAudios(audioResult.rows.map(mapAudioRow));
        if (trackResult.ok) setPersonalTracks(trackResult.rows.map(mapTrackRow));
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
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // Once Supabase is the source of truth, don't let a stale local copy
    // of the shared feed shadow it — only the per-browser pageSize
    // preference still belongs in localStorage.
    const dataToSave = isSupabaseConfigured
      ? { pageSize }
      : { audios, personalTracks, pageSize };
    saveToStorage(dataToSave);
  }, [audios, personalTracks, pageSize, hydrated]);

  // Local-only fallback (used when Supabase isn't configured yet).
  const addAudio = useCallback((partial) => {
    const newAudio = {
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
    setAudios((prev) => [newAudio, ...prev]);
    return newAudio.id;
  }, []);

  // Real path — a row already inserted into Supabase gets mapped and
  // prepended to the feed (optimistic UI, no full re-fetch needed).
  const addAudioFromRow = useCallback((row) => {
    setAudios((prev) => [mapAudioRow(row), ...prev]);
  }, []);

  const addPersonalTrack = useCallback((name) => {
    setPersonalTracks((prev) => [
      ...prev,
      { id: `pbg${Date.now()}`, name, duration: "-" },
    ]);
  }, []);

  const addPersonalTrackFromRow = useCallback((row) => {
    setPersonalTracks((prev) => [...prev, mapTrackRow(row)]);
  }, []);

  const deletePersonalTrack = useCallback((trackId) => {
    setPersonalTracks((prev) => prev.filter((t) => t.id !== trackId));
    if (isSupabaseConfigured) {
      deleteBackgroundTrackRemote(trackId).catch(() => {});
    }
  }, []);

  const setPageSize = useCallback((n) => {
    setPageSizeState(Number(n));
  }, []);

  const value = useMemo(
    () => ({
      audios,
      officialBackgroundThemes,
      personalTracks,
      pageSize,
      addAudio,
      addAudioFromRow,
      addPersonalTrack,
      addPersonalTrackFromRow,
      deletePersonalTrack,
      setPageSize,
    }),
    [
      audios,
      personalTracks,
      pageSize,
      addAudio,
      addAudioFromRow,
      addPersonalTrack,
      addPersonalTrackFromRow,
      deletePersonalTrack,
      setPageSize,
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
