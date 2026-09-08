"use client";

import { useEffect, useRef, useState } from "react";
import { Scissors, Magnet, Trash2, Play, Pause, GripVertical } from "lucide-react";
import { sliceWaveform } from "@/lib/waveform";

const TOTAL_PLAY_MS = 6000;

let splitCounter = 0;
function nextSplitId(base, suffix) {
  splitCounter += 1;
  return `${base}-${suffix}${splitCounter}`;
}

function segmentLabel(seg, idx) {
  if (seg.type === "gap") return "빈 공간";
  return `${idx + 1}. ${seg.name}`;
}

export default function ClipTimeline({ segments, onChange }) {
  const [selectedId, setSelectedId] = useState(null);
  const [cutMode, setCutMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPercent, setPlayheadPercent] = useState(0);
  const [dragId, setDragId] = useState(null);
  const railRef = useRef(null);
  const playStartRef = useRef(null);
  const rafRef = useRef(null);

  const totalUnits = segments.reduce((sum, s) => sum + s.units, 0) || 1;
  const hasGap = segments.some((s) => s.type === "gap");
  const selected = segments.find((s) => s.id === selectedId) || null;

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    playStartRef.current = performance.now() - (playheadPercent / 100) * TOTAL_PLAY_MS;
    function tick(now) {
      const elapsed = now - playStartRef.current;
      const pct = Math.min(100, (elapsed / TOTAL_PLAY_MS) * 100);
      setPlayheadPercent(pct);
      if (pct >= 100) {
        setIsPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  function seekTo(clientX) {
    if (!railRef.current) return;
    const rect = railRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setPlayheadPercent(fraction * 100);
  }

  function handleRailClick(e) {
    seekTo(e.clientX);
  }

  function handleSegmentClick(e, seg) {
    if (cutMode && seg.type === "clip") {
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      if (fraction < 0.04 || fraction > 0.96) return; // avoid sliver splits at edges
      splitSegment(seg.id, fraction);
      setCutMode(false);
      return;
    }
    setSelectedId(seg.id === selectedId ? null : seg.id);
  }

  function splitSegment(id, fraction) {
    const idx = segments.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const seg = segments[idx];
    const [leftWave, rightWave] = sliceWaveform(seg.waveform, fraction);
    const leftUnits = Math.max(4, Math.round(seg.units * fraction));
    const rightUnits = Math.max(4, seg.units - leftUnits);
    const left = {
      ...seg,
      id: nextSplitId(seg.id, "a"),
      units: leftUnits,
      waveform: leftWave,
      name: `${seg.name} (앞)`,
    };
    const right = {
      ...seg,
      id: nextSplitId(seg.id, "b"),
      units: rightUnits,
      waveform: rightWave,
      name: `${seg.name} (뒤)`,
    };
    const next = [...segments];
    next.splice(idx, 1, left, right);
    onChange(next);
    setSelectedId(left.id);
  }

  function deleteSelected() {
    if (!selected) return;
    if (selected.type === "clip") {
      // turn into a gap of the same length — magnetic snap happens
      // separately when the gap itself is deleted
      onChange(
        segments.map((s) =>
          s.id === selected.id
            ? { id: s.id, type: "gap", units: s.units }
            : s
        )
      );
    } else {
      // deleting empty space ripples the neighbours together
      onChange(segments.filter((s) => s.id !== selected.id));
    }
    setSelectedId(null);
  }

  function autoJoinAll() {
    onChange(segments.filter((s) => s.type !== "gap"));
    setSelectedId(null);
  }

  function handleDragStart(id) {
    setDragId(id);
  }

  function handleDropOn(targetId) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const from = segments.findIndex((s) => s.id === dragId);
    const to = segments.findIndex((s) => s.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...segments];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    setDragId(null);
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setIsPlaying((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-700 text-white hover:bg-amber-800"
          aria-label={isPlaying ? "정지" : "재생"}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <button
          type="button"
          onClick={() => setCutMode((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            cutMode
              ? "border-amber-700 bg-amber-50 text-amber-700"
              : "border-stone-300 text-stone-600 hover:bg-stone-100"
          }`}
        >
          <Scissors size={13} /> 자르기{cutMode ? " (파형을 클릭하세요)" : ""}
        </button>

        <button
          type="button"
          onClick={deleteSelected}
          disabled={!selected}
          className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={13} />
          {selected?.type === "gap" ? "빈 공간 삭제 (이어붙이기)" : "선택 구간 삭제"}
        </button>

        <button
          type="button"
          onClick={autoJoinAll}
          disabled={!hasGap}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Magnet size={13} /> 자동으로 붙이기
        </button>
      </div>

      {/* seek rail */}
      <div
        ref={railRef}
        onClick={handleRailClick}
        className="relative mt-4 h-3 cursor-pointer rounded-full bg-stone-100"
      >
        <div
          className="absolute top-0 h-3 rounded-full bg-amber-200"
          style={{ width: `${playheadPercent}%` }}
        />
        <div
          className="absolute -top-1 h-5 w-0.5 bg-amber-700"
          style={{ left: `${playheadPercent}%` }}
        />
      </div>

      {/* timeline */}
      <div className="mt-2 flex h-24 gap-0.5 overflow-hidden rounded-lg">
        {segments.map((seg, idx) => {
          const widthPercent = (seg.units / totalUnits) * 100;
          const isSelected = seg.id === selectedId;
          if (seg.type === "gap") {
            return (
              <button
                key={seg.id}
                type="button"
                onClick={(e) => handleSegmentClick(e, seg)}
                style={{ width: `${widthPercent}%` }}
                className={`flex h-full min-w-[16px] items-center justify-center border-2 border-dashed text-[10px] text-stone-400 transition ${
                  isSelected ? "border-amber-600 bg-amber-50" : "border-stone-300 bg-stone-50"
                }`}
                title="빈 공간 — 선택 후 삭제하면 옆 클립끼리 이어붙습니다"
              >
                빈 공간
              </button>
            );
          }
          return (
            <div
              key={seg.id}
              draggable
              onDragStart={() => handleDragStart(seg.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropOn(seg.id)}
              onClick={(e) => handleSegmentClick(e, seg)}
              style={{ width: `${widthPercent}%` }}
              className={`group relative flex h-full min-w-[28px] cursor-pointer flex-col justify-end overflow-hidden rounded-md border-2 px-1 pb-1 transition ${
                isSelected ? "border-amber-700 bg-amber-50" : "border-stone-200 bg-stone-50 hover:border-stone-300"
              } ${cutMode ? "cursor-crosshair" : ""}`}
              title={segmentLabel(seg, idx)}
            >
              <div className="pointer-events-none absolute left-1 top-1 flex items-center gap-0.5 text-stone-400">
                <GripVertical size={11} />
              </div>
              <div className="flex h-full items-end gap-[1px]">
                {seg.waveform.map((v, i) => (
                  <span
                    key={i}
                    className={`w-full rounded-sm ${isSelected ? "bg-amber-500" : "bg-amber-300"}`}
                    style={{ height: `${v}%` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {segments.length === 0 && (
          <div className="flex w-full items-center justify-center text-xs text-stone-400">
            녹음하거나 파일을 업로드하면 여기에 파형이 표시됩니다.
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-stone-400">
        클립을 드래그해서 순서를 바꾸고(클립이동), 자르기 도구로 파형을 클릭해 두 클립으로 나누세요.
        구간을 삭제하면 빈 공간이 남고, 빈 공간을 다시 선택해 삭제하면 자석처럼 옆 클립과 이어붙습니다.
      </p>
    </div>
  );
}
