"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, Magnet, Trash2, Play, Pause, GripVertical, Music, Move } from "lucide-react";
import {
  DEFAULT_VOICE_OFFSET_SECONDS,
  barsForDuration,
  buildContinuousBuffer,
  computeTiledWaveformPeaks,
  computeWaveformPeaks,
  formatDuration,
  getAudioContext,
  mixVoiceWithBackground,
  sliceAudioBuffer,
} from "@/lib/audio";

let splitCounter = 0;
function nextSplitId(base, suffix) {
  splitCounter += 1;
  return `${base}-${suffix}${splitCounter}`;
}

function segmentLabel(seg, idx) {
  if (seg.type === "gap") return "빈 공간";
  return `${idx + 1}. ${seg.name}`;
}

// 드래그로 조정할 수 있는 "배경음악 인트로" 길이의 최소/최대값(초).
const MIN_VOICE_OFFSET = 0;
const MAX_VOICE_OFFSET = 30;

export default function ClipTimeline({
  segments,
  onChange,
  backgroundBuffer = null,
  backgroundName = "",
  backgroundVolume = 0.35,
  voiceOffsetSeconds = DEFAULT_VOICE_OFFSET_SECONDS,
  onVoiceOffsetChange = () => {},
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [cutMode, setCutMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPercent, setPlayheadPercent] = useState(0);
  const [dragId, setDragId] = useState(null);
  const [previewClipId, setPreviewClipId] = useState(null);
  const [isDraggingOffset, setIsDraggingOffset] = useState(false);
  const railRef = useRef(null);
  const trackRowRef = useRef(null);
  const sourceRef = useRef(null);
  const startedAtRef = useRef(0);
  const rafRef = useRef(null);
  const firstRenderRef = useRef(true);
  const clipSourceRef = useRef(null);
  const offsetDragStateRef = useRef(null);

  const totalSeconds = segments.reduce((sum, s) => sum + (s.duration || 0), 0);
  const hasGap = segments.some((s) => s.type === "gap");
  const selected = segments.find((s) => s.id === selectedId) || null;

  const hasBackground = Boolean(backgroundBuffer);
  // 배경음악이 있으면 "배경음악 인트로(voiceOffsetSeconds) + 목소리 길이"가 전체
  // 타임라인 길이가 됩니다 — 배경음악은 맨 앞부터 바로 나오고, 목소리는 그 뒤에
  // 이어서 시작하는 구조라서요. 배경음악이 없으면 예전처럼 목소리 길이만큼입니다.
  const timelineSeconds = hasBackground ? voiceOffsetSeconds + totalSeconds : totalSeconds;

  // Real, continuous audio built from the actual decoded clips + real
  // silence for gaps — this is what actually plays, not a fake timer.
  // When a real background track is provided, it's mixed in too (background
  // first, voice starting voiceOffsetSeconds later), so this play button
  // previews the same thing the final save would produce.
  const previewBuffer = useMemo(() => {
    const voice = buildContinuousBuffer(segments);
    if (!voice) return null;
    if (!backgroundBuffer) return voice;
    return mixVoiceWithBackground(voice, backgroundBuffer, backgroundVolume, voiceOffsetSeconds);
  }, [segments, backgroundBuffer, backgroundVolume, voiceOffsetSeconds]);

  // 배경음악 트랙을 화면에 두 번째 줄로 보여주기 위한 파형 — 실제 믹싱 때와 똑같이
  // 전체 타임라인 길이(인트로 + 목소리)에 맞춰 반복/트림된 모양으로 미리 계산합니다.
  const backgroundWaveform = useMemo(
    () => (backgroundBuffer ? computeTiledWaveformPeaks(backgroundBuffer, timelineSeconds) : null),
    [backgroundBuffer, timelineSeconds]
  );

  // 재생 헤드 라벨은 (배경음악이 있으면) 실제로 재생되는 최종 믹스 길이를 기준으로
  // 보여줘야 정확합니다 — 인트로만큼 목소리 길이보다 더 길어지기 때문입니다.
  const displayTotalSeconds = previewBuffer ? previewBuffer.duration : totalSeconds;

  function stopPlayback() {
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
      } catch (e) {
        // already stopped
      }
      sourceRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
  }

  function tick() {
    const ctx = getAudioContext();
    if (!sourceRef.current || !previewBuffer) return;
    const elapsed = ctx.currentTime - startedAtRef.current;
    const pct = Math.min(100, (elapsed / previewBuffer.duration) * 100);
    setPlayheadPercent(pct);
    if (pct >= 100) {
      stopPlayback();
      setIsPlaying(false);
      setPlayheadPercent(0);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function playFrom(offsetSeconds) {
    if (!previewBuffer || previewBuffer.duration <= 0) return;
    stopPlayback();
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = previewBuffer;
    source.connect(ctx.destination);
    const clampedOffset = Math.max(0, Math.min(previewBuffer.duration - 0.02, offsetSeconds));
    source.start(0, clampedOffset);
    sourceRef.current = source;
    startedAtRef.current = ctx.currentTime - clampedOffset;
    source.onended = () => {
      sourceRef.current = null;
    };
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
      return;
    }
    const offsetSeconds = (playheadPercent / 100) * (previewBuffer?.duration || 0);
    playFrom(offsetSeconds);
  }

  function stopClipPreview() {
    if (clipSourceRef.current) {
      try {
        clipSourceRef.current.onended = null;
        clipSourceRef.current.stop();
      } catch (e) {
        // already stopped
      }
      clipSourceRef.current = null;
    }
    setPreviewClipId(null);
  }

  // 클립 하나만 짧게 미리듣기 — 전체 타임라인 재생과는 별개입니다.
  function toggleClipPreview(seg) {
    if (!seg.buffer) return;
    if (previewClipId === seg.id) {
      stopClipPreview();
      return;
    }
    stopClipPreview();
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = seg.buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      setPreviewClipId((prev) => (prev === seg.id ? null : prev));
      clipSourceRef.current = null;
    };
    source.start(0);
    clipSourceRef.current = source;
    setPreviewClipId(seg.id);
  }

  // 녹음/업로드 직후 마음에 들지 않는 클립을 곧바로 완전히 삭제합니다.
  // (편집 중 자르기로 생긴 구간을 지우는 것과 달리, 빈 공간을 남기지 않고
  // 바로 사라지면서 뒤 클립이 앞으로 당겨집니다.)
  function deleteClipEntirely(id) {
    onChange(segments.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (previewClipId === id) stopClipPreview();
  }

  // Stop playback and reset the playhead whenever the edit list (or the
  // background intro length) changes underneath us.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    stopPlayback();
    stopClipPreview();
    setIsPlaying(false);
    setPlayheadPercent(0);
  }, [segments, backgroundBuffer, voiceOffsetSeconds]);

  useEffect(() => {
    return () => {
      stopPlayback();
      stopClipPreview();
      if (offsetDragStateRef.current) {
        window.removeEventListener("mousemove", handleOffsetDragMove);
        window.removeEventListener("mouseup", handleOffsetDragEnd);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function seekTo(clientX) {
    if (!railRef.current || !previewBuffer) return;
    const rect = railRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setPlayheadPercent(fraction * 100);
    if (isPlaying) {
      playFrom(fraction * previewBuffer.duration);
    }
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
    if (!seg.buffer) return;
    const leftBuffer = sliceAudioBuffer(seg.buffer, 0, fraction);
    const rightBuffer = sliceAudioBuffer(seg.buffer, fraction, 1);
    const left = {
      ...seg,
      id: nextSplitId(seg.id, "a"),
      buffer: leftBuffer,
      duration: leftBuffer.duration,
      waveform: computeWaveformPeaks(leftBuffer, barsForDuration(leftBuffer.duration)),
      name: `${seg.name} (앞)`,
    };
    const right = {
      ...seg,
      id: nextSplitId(seg.id, "b"),
      buffer: rightBuffer,
      duration: rightBuffer.duration,
      waveform: computeWaveformPeaks(rightBuffer, barsForDuration(rightBuffer.duration)),
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
            ? { id: s.id, type: "gap", duration: s.duration }
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

  // 배경음악 인트로 길이를 직관적으로 드래그해서 조정합니다 — 목소리 트랙 맨 앞의
  // 파란 핸들을 좌우로 끌면 "배경음악만 나오는 구간"이 늘거나 줄어듭니다.
  function handleOffsetDragStart(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = trackRowRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    offsetDragStateRef.current = {
      startX: e.clientX,
      rectWidth: rect.width,
      startOffset: voiceOffsetSeconds,
    };
    setIsDraggingOffset(true);
    window.addEventListener("mousemove", handleOffsetDragMove);
    window.addEventListener("mouseup", handleOffsetDragEnd);
  }

  function handleOffsetDragMove(e) {
    const state = offsetDragStateRef.current;
    if (!state) return;
    const deltaPx = e.clientX - state.startX;
    const secondsPerPixel = timelineSeconds > 0 ? timelineSeconds / state.rectWidth : 0;
    const next = state.startOffset + deltaPx * secondsPerPixel;
    const clamped = Math.max(MIN_VOICE_OFFSET, Math.min(MAX_VOICE_OFFSET, next));
    onVoiceOffsetChange(Math.round(clamped * 10) / 10);
  }

  function handleOffsetDragEnd() {
    offsetDragStateRef.current = null;
    setIsDraggingOffset(false);
    window.removeEventListener("mousemove", handleOffsetDragMove);
    window.removeEventListener("mouseup", handleOffsetDragEnd);
  }

  const elapsedSeconds = (playheadPercent / 100) * displayTotalSeconds;
  const introWidthPercent =
    hasBackground && timelineSeconds > 0 ? (voiceOffsetSeconds / timelineSeconds) * 100 : 0;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          disabled={totalSeconds === 0}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-700 text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          aria-label={isPlaying ? "정지" : "재생"}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <span className="text-xs tabular-nums text-stone-400">
          {formatDuration(elapsedSeconds)} / {formatDuration(displayTotalSeconds)}
        </span>

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

      {/* 목소리 트랙 + (있다면) 배경음악 트랙을 같은 시간축에 정렬해서 보여주는 영역.
          두 트랙 위로 재생 위치를 나타내는 세로선이 함께 지나갑니다. */}
      <div className="relative mt-2">
      <div ref={trackRowRef} className="flex h-32 gap-0.5 overflow-hidden rounded-lg">
        {hasBackground && (
          <div
            style={{ width: `${introWidthPercent}%` }}
            className={`relative flex h-full min-w-[10px] shrink-0 items-center justify-center overflow-visible rounded-md border-2 border-dashed transition ${
              isDraggingOffset ? "border-sky-500 bg-sky-50" : "border-sky-200 bg-sky-50/60"
            }`}
            title="배경음악만 먼저 나오는 구간 — 오른쪽 손잡이를 드래그해서 길이를 조정하세요"
          >
            {introWidthPercent > 6 && (
              <span className="pointer-events-none px-1 text-center text-[10px] leading-tight text-sky-500">
                배경음악
                <br />
                {voiceOffsetSeconds.toFixed(1)}초
              </span>
            )}
            <button
              type="button"
              onMouseDown={handleOffsetDragStart}
              className="absolute -right-2.5 top-1/2 flex h-7 w-5 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-sky-500 text-white shadow hover:bg-sky-600"
              aria-label="배경음악 인트로 길이 조정"
              title="드래그해서 목소리가 시작되는 시점을 조정하세요"
            >
              <Move size={11} />
            </button>
          </div>
        )}
        {segments.map((seg, idx) => {
          const widthPercent = timelineSeconds > 0 ? ((seg.duration || 0) / timelineSeconds) * 100 : 0;
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
          const previewingThis = previewClipId === seg.id;
          return (
            <div
              key={seg.id}
              draggable
              onDragStart={() => handleDragStart(seg.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropOn(seg.id)}
              onClick={(e) => handleSegmentClick(e, seg)}
              style={{ width: `${widthPercent}%` }}
              className={`group relative flex h-full min-w-[96px] cursor-pointer flex-col justify-end overflow-hidden rounded-md border-2 px-1 pb-1 transition ${
                isSelected ? "border-amber-700 bg-amber-50" : "border-stone-200 bg-stone-50 hover:border-stone-300"
              } ${cutMode ? "cursor-crosshair" : ""}`}
              title={segmentLabel(seg, idx)}
            >
              <div className="pointer-events-none absolute left-1 top-1 flex items-center gap-0.5 text-stone-400">
                <GripVertical size={11} />
              </div>

              {/* 이 클립만 짧게 미리듣기 / 통째로 완전 삭제 — 편집용 2단계 삭제와는 별개의 빠른 삭제 */}
              <div className="absolute right-1 top-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleClipPreview(seg);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm hover:bg-white"
                  aria-label="클립 미리듣기"
                  title="이 클립만 미리듣기"
                >
                  {previewingThis ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteClipEntirely(seg.id);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-500 shadow-sm hover:bg-red-50 hover:text-red-600"
                  aria-label="클립 전체 삭제"
                  title="이 클립 전체 삭제"
                >
                  <Trash2 size={18} />
                </button>
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
              <div className="pointer-events-none absolute bottom-1 right-1 text-[10px] text-stone-400">
                {formatDuration(seg.duration)}
              </div>
            </div>
          );
        })}
        {segments.length === 0 && (
          <div className="flex w-full items-center justify-center text-xs text-stone-400">
            녹음하거나 파일을 업로드하면 실제 파형이 여기에 표시됩니다.
          </div>
        )}
      </div>

      {/* 배경음악 트랙 — 목소리 트랙과 같은 가로 폭(=같은 시간축)에 정렬됩니다.
          배경음악은 맨 앞부터 바로 나오므로 인트로 구간 없이 처음부터 채워집니다. */}
      {backgroundWaveform && backgroundWaveform.length > 0 && (
        <div className="mt-1 rounded-lg bg-sky-50 p-1.5">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-medium text-sky-600">
            <Music size={10} /> 배경음악{backgroundName ? `: ${backgroundName}` : ""} · 목소리는{" "}
            {voiceOffsetSeconds.toFixed(1)}초 후 시작
          </p>
          <div className="flex h-10 items-end gap-[1px] overflow-hidden">
            {backgroundWaveform.map((v, i) => (
              <span key={i} className="w-full rounded-sm bg-sky-300" style={{ height: `${v}%` }} />
            ))}
          </div>
        </div>
      )}

      {/* 목소리 + 배경음악 트랙을 함께 관통하는 재생 위치 세로선 */}
      {timelineSeconds > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-amber-700/70"
          style={{ left: `${playheadPercent}%` }}
        />
      )}
      </div>

      <p className="mt-2 text-xs text-stone-400">
        클립을 드래그해서 순서를 바꾸고(클립이동), 자르기 도구로 파형을 클릭해 두 클립으로 나누세요.
        클립 우측 상단의 ▶ / 휴지통 아이콘으로 그 클립만 미리듣고 마음에 안 들면 통째로 바로 삭제할 수 있어요.
        (구간 삭제 버튼으로 지우면 빈 공간이 남고, 빈 공간을 다시 선택해 삭제하면 자석처럼 옆 클립과 이어붙는
        정밀 편집용 방식입니다.) 재생 버튼은 실제 녹음/업로드된 오디오를 그대로 재생하고, 배경음악을
        선택했다면 맨 앞의 하늘색 구간(배경음악 인트로) 오른쪽 손잡이를 드래그해서 목소리가 시작되는
        시점을 자유롭게 조정할 수 있어요. 아래 파란 트랙에 같은 시간축으로 표시되며 함께 섞여 재생됩니다.
      </p>
    </div>
  );
}
