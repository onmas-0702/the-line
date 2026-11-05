"use client";

// My Page 섹션들이 함께 쓰는 것 — 채널에 묶이지 않은(플랫폼 전체) 저장소와, 불러오기 상태.

import { useEffect, useMemo, useState } from "react";
import { ChannelCommunityRepository, NoticeRepository } from "@/lib/community";
import { AudioMarkRepository, JournalRepository } from "@/lib/engagement";

export function useMyPageRepos() {
  return useMemo(
    () => ({
      notices: new NoticeRepository(),
      community: new ChannelCommunityRepository(),
      marks: new AudioMarkRepository(),
      journal: new JournalRepository(),
    }),
    []
  );
}

/** load()가 돌려주는 결과 객체({ ok, reason, ... })를 불러와 { result, isLoading, setResult }로. */
export function useLoaded(load, deps) {
  const [state, setState] = useState({ result: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;
    load().then((result) => {
      if (!cancelled) setState({ result, isLoading: false });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setResult = (updater) => setState((prev) => ({ ...prev, result: updater(prev.result) }));
  return { ...state, setResult };
}

export function LoadState({ isLoading, result, empty, children }) {
  if (isLoading) return <p className="py-8 text-center text-sm text-stone-400">불러오는 중…</p>;
  if (result && !result.ok) {
    return (
      <p className="py-8 text-center text-sm text-stone-400">
        {result.reason === "not-configured" ? "서버(Supabase)가 연결되지 않았어요." : "불러오지 못했어요. 잠시 후 다시 시도해 주세요."}
      </p>
    );
  }
  if (empty) return <p className="py-8 text-center text-sm text-stone-400">{empty}</p>;
  return children;
}
