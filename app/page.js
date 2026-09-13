"use client";

import { useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/audio";
import { SITE_NAME } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";

// 홈 화면 — 배경 스킨이 적용되어 있으면 "최신 콘텐츠는 큰 재생 버튼 하나,
// 나머지는 아래에 담백한 텍스트 목록" 형태의 감성적인 한 장의 화면으로
// 보여줍니다. 스킨이 없으면(기본 상태) 흰 배경 위에 같은 색상 규칙(호박색)을
// 쓰는 안전한 기본 모습으로 대체됩니다.
export default function HomePage() {
  const { audios, pageSize, skinImageUrl, textColor } = useAppStore();
  const [playingId, setPlayingId] = useState(null);
  // 재생 중인 항목의 "남은 시간" — 재생과 동시에 전체 길이에서 거꾸로
  // 줄어들다가 0:00이 되면 끝나는 카운트다운 표시용입니다.
  const [remainingLabel, setRemainingLabel] = useState("");
  const audioRef = useRef(null);

  function handleTimeUpdate() {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    const remaining = Math.max(0, el.duration - el.currentTime);
    setRemainingLabel(formatDuration(remaining));
  }

  const sorted = useMemo(() => {
    const copy = [...audios];
    copy.sort((a, b) => (a.date < b.date ? 1 : -1));
    return copy;
  }, [audios]);

  const visible = sorted.slice(0, pageSize);
  const latest = visible[0] || null;
  const rest = visible.slice(1);

  const isSkinned = Boolean(skinImageUrl);
  const color = textColor || "#ffffff";
  const titleStyle = isSkinned ? { color } : undefined;
  const subStyle = isSkinned ? { color, opacity: 0.75 } : undefined;

  // 재생 중이던 항목을 다시 누르면 정지, 다른 항목을 누르면 그걸로 갈아탑니다 —
  // 하나의 오디오 엘리먼트를 재사용하는 방식(재생 버튼을 누른 그 순간 바로
  // play()를 호출해야 브라우저 자동재생 정책에 안전합니다).
  function togglePlay(item) {
    const el = audioRef.current;
    if (!item?.previewUrl || !el) return;
    if (playingId === item.id) {
      el.pause();
      setPlayingId(null);
      setRemainingLabel("");
      return;
    }
    el.pause();
    el.src = item.previewUrl;
    el.currentTime = 0;
    el.play().catch(() => {});
    setPlayingId(item.id);
    setRemainingLabel(item.duration); // 재생 시작 직후 첫 timeupdate 전까지는 전체 길이로 시작
  }

  if (!latest) {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center gap-2 text-center">
        <h1 className={`text-lg font-semibold ${isSkinned ? "" : "text-stone-900"}`} style={titleStyle}>
          {SITE_NAME}
        </h1>
        <p className={`text-sm ${isSkinned ? "" : "text-stone-400"}`} style={subStyle}>
          아직 등록된 나눔이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[75vh] flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        <p
          className={`text-xs uppercase tracking-widest ${isSkinned ? "" : "text-stone-400"}`}
          style={subStyle}
        >
          {[latest.pastorName, latest.church].filter(Boolean).join(" · ")}
        </p>
        <h1
          className={`max-w-xs text-xl font-semibold leading-snug ${isSkinned ? "" : "text-stone-900"}`}
          style={titleStyle}
        >
          {latest.title}
        </h1>
        <button
          type="button"
          onClick={() => togglePlay(latest)}
          disabled={!latest.previewUrl}
          title={latest.previewUrl ? undefined : "샘플 데이터입니다 (재생 준비중)"}
          className={`flex h-20 w-20 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
            isSkinned
              ? "bg-white/20 backdrop-blur-sm hover:bg-white/30"
              : "bg-amber-700 text-white hover:bg-amber-800"
          }`}
          style={isSkinned ? titleStyle : undefined}
          aria-label={playingId === latest.id ? "정지" : "재생"}
        >
          {playingId === latest.id ? <Pause size={30} /> : <Play size={30} className="ml-1" />}
        </button>
        <p className={`text-xs tabular-nums ${isSkinned ? "" : "text-stone-400"}`} style={subStyle}>
          {playingId === latest.id ? remainingLabel : latest.duration}
        </p>
      </div>

      {rest.length > 0 && (
        <div className="space-y-0.5 px-2 pb-6">
          {rest.map((item) => {
            const isPlayingThis = playingId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => togglePlay(item)}
                disabled={!item.previewUrl}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isSkinned ? "hover:bg-white/10" : "hover:bg-stone-100"
                }`}
              >
                <span
                  className={`flex min-w-0 items-center gap-2 text-sm ${isSkinned ? "" : "text-stone-700"}`}
                  style={titleStyle}
                >
                  {isPlayingThis ? <Pause size={13} className="shrink-0" /> : <Play size={13} className="shrink-0" />}
                  <span className="truncate">{item.title}</span>
                </span>
                <span
                  className={`shrink-0 text-xs tabular-nums ${isSkinned ? "" : "text-stone-400"}`}
                  style={subStyle}
                >
                  {isPlayingThis ? remainingLabel : item.duration}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          setPlayingId(null);
          setRemainingLabel("");
        }}
        className="hidden"
      />
    </div>
  );
}
