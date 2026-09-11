"use client";

import { useRef, useState } from "react";
import { Download, FileText, Pause, Play } from "lucide-react";

export default function AudioCard({ item }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // Newly recorded/uploaded audios carry a real, playable previewUrl
  // (created from the actual mixed-down audio). The original 5 seed
  // items are sample data with no underlying file, so playback stays
  // disabled for those rather than faking a play button.
  const playable = Boolean(item.previewUrl);

  function togglePlay() {
    const el = audioRef.current;
    if (!playable || !el) return;
    if (isPlaying) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-amber-700">
            {item.pastorName} · {item.church}
          </p>
          <h3 className="mt-1 text-base font-semibold text-stone-900">
            {item.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {item.hasScript && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                <FileText size={11} /> 대본 있음
              </span>
            )}
            {item.category && (
              <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
                {item.category}
              </span>
            )}
            {item.scriptureReference && (
              <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
                {item.scriptureReference}
              </span>
            )}
          </div>
        </div>
        <span className="whitespace-nowrap text-xs text-stone-400">
          {item.date}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!playable}
          title={playable ? undefined : "샘플 데이터입니다 (재생 준비중)"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-700 text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          aria-label="재생"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <div className="h-2 flex-1 rounded-full bg-stone-100">
          <div
            className="h-2 rounded-full bg-amber-300 transition-[width]"
            style={{ width: `${playable ? progress : 25}%` }}
          />
        </div>
        <span className="text-xs text-stone-400">{item.duration}</span>
      </div>

      {playable && (
        <audio
          ref={audioRef}
          src={item.previewUrl}
          preload="none"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            const pct = el.duration ? (el.currentTime / el.duration) * 100 : 0;
            setProgress(pct);
          }}
          className="hidden"
        />
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-stone-400">
        <span>재생 {item.plays}회</span>
        {item.scriptUrl ? (
          <a
            href={item.scriptUrl}
            download={item.scriptFileName || true}
            className="ml-auto flex items-center gap-1 hover:text-amber-700"
          >
            <Download size={13} /> 대본 다운로드
          </a>
        ) : (
          <button
            type="button"
            disabled={!item.hasScript}
            className="ml-auto flex items-center gap-1 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={13} /> 대본 다운로드
          </button>
        )}
      </div>
    </div>
  );
}
