"use client";

// 콘텐츠 화면의 진행바 — 가는 선 하나와 재생 위치를 따라 움직이는 점. 누르거나 끌면 그 위치로 이동합니다.
// 감상 모드(화면을 한동안 안 만짐)에도 이미지와 함께 남는 유일한 요소입니다.

import { useRef } from "react";
import { SeekBar } from "@/lib/playback";

export default function PlaybackProgress({ elapsed, duration, onSeek, isImmersive }) {
  const barRef = useRef(null);
  const percent = SeekBar.fraction(elapsed, duration) * 100;
  const track = isImmersive ? "bg-white/30" : "bg-stone-200";
  const fill = isImmersive ? "bg-white" : "bg-night-700";

  function seekTo(clientX) {
    const rect = barRef.current?.getBoundingClientRect();
    if (rect) onSeek(SeekBar.secondsAt(clientX, rect, duration));
  }

  function handlePointerDown(e) {
    if (!duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekTo(e.clientX);
  }

  function handlePointerMove(e) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e.clientX);
  }

  function handleKeyDown(e) {
    if (!duration) return;
    if (e.key === "ArrowRight") onSeek(Math.min(duration, elapsed + 5));
    else if (e.key === "ArrowLeft") onSeek(Math.max(0, elapsed - 5));
  }

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-label="재생 위치"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 0}
      aria-valuenow={Math.round(elapsed)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
      className="relative h-6 w-full max-w-xs cursor-pointer touch-none outline-none"
    >
      <div className={`absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full ${track}`} />
      <div className={`absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full ${fill}`} style={{ width: `${percent}%` }} />
      <div
        className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${fill} ${
          isImmersive ? "shadow-[0_0_8px_rgb(255_255_255/0.6)]" : ""
        }`}
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}
