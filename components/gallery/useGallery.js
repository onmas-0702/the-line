"use client";

// 이미지 갤러리 화면들이 함께 쓰는 것 — 저장소와 공개 이미지 목록 불러오기.

import { useEffect, useMemo, useState } from "react";
import { GalleryRepository, MyGalleryRepository } from "@/lib/gallery";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export function useGalleryRepos() {
  return useMemo(() => ({ gallery: new GalleryRepository(), myGallery: new MyGalleryRepository() }), []);
}

/** 공개된 갤러리 이미지(최신순). { images, isLoading, isUnavailable } */
export function useGalleryImages({ limit = null } = {}) {
  const { gallery } = useGalleryRepos();
  const [state, setState] = useState({ images: [], isLoading: isSupabaseConfigured, isUnavailable: !isSupabaseConfigured });

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let cancelled = false;
    gallery.list({ limit }).then((result) => {
      if (!cancelled) setState({ images: result.images, isLoading: false, isUnavailable: !result.ok });
    });
    return () => {
      cancelled = true;
    };
  }, [gallery, limit]);

  return state;
}
