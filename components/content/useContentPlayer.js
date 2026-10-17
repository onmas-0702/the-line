"use client";

// 콘텐츠 재생 — 콘텐츠 화면의 큰 재생 버튼이 씁니다. 재생을 시작할 때마다 청취수(서버)와
// "자주 듣는 메신저" 기록(이 브라우저)을 남깁니다. <audio>는 audioProps로 화면에 둡니다.

import { useRef, useState } from "react";
import { useChannel } from "@/components/ChannelProvider";
import { ListeningHistory } from "@/lib/feed";

export function useContentPlayer() {
  const { repos } = useChannel();
  const audioRef = useRef(null);
  const [current, setCurrent] = useState(null); // 실제로 불러와 재생한 콘텐츠
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  function start(item) {
    const el = audioRef.current;
    if (!el || !item?.previewUrl) return;
    el.pause();
    el.src = item.previewUrl;
    el.currentTime = 0;
    el.play().catch(() => {});
    setCurrent(item);
    setElapsed(0);
    setDuration(0);
    repos.audios.recordPlay(item.id).catch(() => {});
    ListeningHistory.load().record(item);
  }

  /** 같은 콘텐츠면 재생/일시정지, 다른 콘텐츠면 처음부터 재생. */
  function toggle(item) {
    const el = audioRef.current;
    if (!el || !item?.previewUrl) return;
    const isSameLoaded = current?.id === item.id && el.src;
    if (!isSameLoaded) return start(item);
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  const audioProps = {
    ref: audioRef,
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
    onEnded: () => setIsPlaying(false),
    onTimeUpdate: (e) => setElapsed(e.currentTarget.currentTime),
    onLoadedMetadata: (e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0),
    className: "hidden",
  };

  /** item이 지금 불러와진 콘텐츠일 때의 재생 상태. */
  function stateOf(item) {
    const isLoaded = Boolean(item) && current?.id === item.id;
    return {
      isPlaying: isLoaded && isPlaying,
      remaining: isLoaded && duration ? Math.max(0, duration - elapsed) : null,
    };
  }

  return { current, toggle, stateOf, audioProps };
}
