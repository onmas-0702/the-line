"use client";

// 트랙 뮤트 버튼 — 오디오 트랙·배경음악 트랙 이름 옆. 누르면 그 트랙이 미리듣기에서 안 들립니다(저장에는 영향 없음).

import { Volume2, VolumeX } from "lucide-react";

export default function MuteButton({ muted, onToggle, label, tone = "night" }) {
  const off = tone === "sky" ? "border-sky-300 text-sky-700 hover:bg-sky-50" : "border-night-200 text-night-700 hover:bg-night-50";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={muted}
      title={muted ? `${label} 뮤트 풀기 — 다시 들려요` : `${label} 뮤트 — 듣는 동안만 소리를 꺼요(저장에는 그대로 들어가요)`}
      className={`ml-1 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-medium transition ${
        muted ? "border-rose-500 bg-rose-500 text-white" : `bg-white ${off}`
      }`}
    >
      {muted ? <VolumeX size={10} aria-hidden /> : <Volume2 size={10} aria-hidden />}
      {muted ? "뮤트됨" : "뮤트"}
    </button>
  );
}
