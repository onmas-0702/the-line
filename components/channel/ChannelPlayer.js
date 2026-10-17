"use client";

// 채널 페이지 하단의 재생 바 — 카드를 누르면 페이지를 떠나지 않고 여기서 재생합니다.
// 재생을 시작할 때마다 청취수(서버)와 "자주 듣는 메신저" 기록(이 브라우저)을 남깁니다.

import { useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import ContentThumbnail from "@/components/ContentThumbnail";
import { useChannel } from "@/components/ChannelProvider";
import { TimeFormat } from "@/lib/audio";
import { ListeningHistory } from "@/lib/feed";

export function useChannelPlayer() {
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

  function close() {
    audioRef.current?.pause();
    setCurrent(null);
    setIsPlaying(false);
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

  return { current, isPlaying, elapsed, duration, toggle, close, audioProps };
}

/** 재생 바. item은 지금 재생 중인 콘텐츠, 없으면 "재생 준비"로 띄워 둘 콘텐츠
 *  (랜딩에서 눌러 들어온 콘텐츠 등). <audio>는 재생이 끊기지 않도록 항상 같은 자리에 둡니다. */
export function PlayerBar({ player, item, thumbnailUrl, onClose }) {
  const isLoaded = player.current?.id === item?.id;
  const isPlaying = isLoaded && player.isPlaying;
  const elapsed = isLoaded ? player.elapsed : 0;
  const progress = isLoaded && player.duration ? Math.min(100, (elapsed / player.duration) * 100) : 0;

  return (
    <>
      {item && (
    <div className="fixed inset-x-0 bottom-[68px] z-20 px-3 sm:bottom-4">
      <div className="mx-auto flex max-w-3xl items-center gap-3 overflow-hidden rounded-2xl border border-stone-200 bg-white/95 p-2 pr-3 shadow-lg backdrop-blur">
        <ContentThumbnail item={item} imageUrl={thumbnailUrl} showDuration={false} className="h-11 w-11 shrink-0 rounded-xl p-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-stone-900">{item.title}</p>
          <p className="truncate text-xs text-stone-500">
            {item.pastorName ? `${item.pastorName} · ` : ""}
            {TimeFormat.duration(elapsed)} / {item.duration}
          </p>
          <div className="mt-1 h-1 rounded-full bg-stone-200">
            <div className="h-1 rounded-full bg-amber-600 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => player.toggle(item)}
          disabled={!item.previewUrl}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-700 text-white hover:bg-amber-800 disabled:bg-stone-300"
          aria-label={isPlaying ? "일시정지" : "재생"}
        >
          {isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
        </button>
        <button
          type="button"
          onClick={() => {
            player.close();
            onClose?.();
          }}
          className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-stone-100"
          aria-label="재생 바 닫기"
        >
          <X size={16} />
        </button>
      </div>
    </div>
      )}
      <audio {...player.audioProps} />
    </>
  );
}
