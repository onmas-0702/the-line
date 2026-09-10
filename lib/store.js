"use client";
/* eslint-disable react-hooks/set-state-in-effect --
   Hydrating from localStorage on mount is a deliberate one-time sync
   with an external store, not a derived-state anti-pattern. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  initialAudios,
  initialPersonalTracks,
  officialBackgroundThemes,
  todayLabel,
} from "@/lib/mockData";

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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // ignore quota / privacy-mode errors — wireframe only
  }
}

export function AppStoreProvider({ children }) {
  const [audios, setAudios] = useState(initialAudios);
  const [personalTracks, setPersonalTracks] = useState(initialPersonalTracks);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once on mount from localStorage (client only, avoids SSR mismatch).
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) {
      if (saved.audios) setAudios(saved.audios);
      if (saved.personalTracks) setPersonalTracks(saved.personalTracks);
      if (saved.pageSize) setPageSizeState(saved.pageSize);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage({ audios, personalTracks, pageSize });
  }, [audios, personalTracks, pageSize, hydrated]);

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

  const addPersonalTrack = useCallback((name) => {
    setPersonalTracks((prev) => [
      ...prev,
      { id: `pbg${Date.now()}`, name, duration: "-" },
    ]);
  }, []);

  const deletePersonalTrack = useCallback((trackId) => {
    setPersonalTracks((prev) => prev.filter((t) => t.id !== trackId));
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
      addPersonalTrack,
      deletePersonalTrack,
      setPageSize,
    }),
    [
      audios,
      personalTracks,
      pageSize,
      addAudio,
      addPersonalTrack,
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
