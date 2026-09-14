"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, Magnet, Trash2, Play, Pause, GripVertical, Music, Move, GripHorizontal } from "lucide-react";
import {
  DEFAULT_VOICE_OFFSET_SECONDS,
  MAX_CLIP_GAIN,
  MIN_CLIP_GAIN,
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

// 자르기 모드에서 클립 위에 마우스를 올렸을 때 보여줄 가위 모양 커서.
// 실제 이미지 파일 없이 SVG를 데이터 URI로 인라인해서 씁니다.
const SCISSORS_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="%23b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>') 2 2, crosshair`;

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
  const [isDraggingOffset, setIsDraggingOffset] = useState(false);
  const [gainDraft, setGainDraft] = useState(null); // { id, gain } — 드래그 중 미리보기 값
  const railRef = useRef(null);
  const trackRowRef = useRef(null);
  const sourceRef = useRef(null);
  const startedAtRef = useRef(0);
  const rafRef = useRef(null);
  const firstRenderRef = useRef(true);
  const offsetDragStateRef = useRef(null);
  const gainDragStateRef = useRef(null);

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

  // 아래 스페이스바 keydown 리스너는 마운트 시 한 번만 등록되기 때문에, 그
  // 안에서 그냥 togglePlay를 직접 부르면 "마운트 당시의" isPlaying/
  // previewBuffer(대개 아직 녹음 전이라 null)만 계속 참조하는 stale closure
  // 버그가 생깁니다 — 그래서 실제로는 재생이 전혀 안 되는 것처럼 보였던
  // 원인이었어요. 매 렌더마다 최신 togglePlay를 ref에 담아두고, 리스너는
  // 그 ref를 통해서만 호출하도록 고쳤습니다.
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => {
    togglePlayRef.current = togglePlay;
  });

  // 녹음/업로드 직후 마음에 들지 않는 클립을 곧바로 완전히 삭제합니다.
  // (편집 중 자르기로 생긴 구간을 지우는 것과 달리, 빈 공간을 남기지 않고
  // 바로 사라지면서 뒤 클립이 앞으로 당겨집니다.)
  function deleteClipEntirely(id) {
    onChange(segments.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // Stop playback and reset the playhead whenever the edit list (or the
  // background intro length) changes underneath us.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    stopPlayback();
    setIsPlaying(false);
    setPlayheadPercent(0);
  }, [segments, backgroundBuffer, voiceOffsetSeconds]);

  useEffect(() => {
    return () => {
      stopPlayback();
      if (offsetDragStateRef.current) {
        window.removeEventListener("mousemove", handleOffsetDragMove);
        window.removeEventListener("mouseup", handleOffsetDragEnd);
      }
      if (gainDragStateRef.current) {
        window.removeEventListener("mousemove", handleGainDragMove);
        window.removeEventListener("mouseup", handleGainDragEnd);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 스페이스바로 재생/정지 (핸드폰 등 터치 기기는 제외 — 가상 키보드가 없어
  // 스페이스바 자체가 의미 없기도 하고, 화면 스크롤과 충돌할 수 있어서요).
  // 입력창에 포커스가 있을 때는 원래의 스페이스 입력(띄어쓰기)을 그대로 둡니다.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.code !== "Space" && e.key !== " ") return;
      const isTouchDevice =
        typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
      if (isTouchDevice) return;
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) return;
      e.preventDefault();
      // 버튼에 포커스가 남아있으면(마우스로 자르기/재생 버튼 등을 클릭한 직후)
      // 브라우저가 스페이스를 그 버튼의 클릭으로도 한 번 더 해석해서, 우리가
      // 여기서 토글한 재생 상태를 곧바로 되돌려버리는 경우가 있었습니다.
      // 포커스를 미리 없애서 그 "이중 토글"을 막습니다.
      if (tag === "BUTTON" && active instanceof HTMLElement) {
        active.blur();
      }
      togglePlayRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Delete / Backspace 키로도 선택된 구간을 지울 수 있게 합니다(맥 키보드의
  // "delete" 키는 실제로는 Backspace 이벤트를 보냅니다).
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selected) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      deleteSelected();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // 클립을 클릭한 위치에 맞춰 재생 헤드(세로선)를 옮깁니다 — 재생 중이면
  // 그 위치부터 이어서 들리도록 실제로 탐색(seek)도 함께 합니다.
  function seekToSegment(e, seg, idx) {
    if (seg.type !== "clip" || timelineSeconds <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fractionWithinSeg = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    let cumulative = hasBackground ? voiceOffsetSeconds : 0;
    for (let i = 0; i < idx; i++) {
      cumulative += segments[i].duration || 0;
    }
    const absoluteSeconds = cumulative + (seg.duration || 0) * fractionWithinSeg;
    const percent = Math.max(0, Math.min(100, (absoluteSeconds / timelineSeconds) * 100));
    setPlayheadPercent(percent);
    if (isPlaying) {
      playFrom((percent / 100) * (previewBuffer?.duration || 0));
    }
  }

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

  function handleSegmentClick(e, seg, idx) {
    if (cutMode && seg.type === "clip") {
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      if (fraction < 0.04 || fraction > 0.96) return; // avoid sliver splits at edges
      splitSegment(seg.id, fraction);
      setCutMode(false);
      return;
    }
    setSelectedId(seg.id === selectedId ? null : seg.id);
    seekToSegment(e, seg, idx);
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

  // 클립 중앙의 수직선을 위/아래로 드래그해서 그 클립만의 볼륨을 조절합니다.
  // 드래그 중에는 화면에만 미리 보여주고(gainDraft), 손을 뗄 때 한 번만
  // segments에 반영합니다 — 매 마우스 이동마다 실행취소 이력이 쌓이는 걸
  // 막기 위해서예요.
  function handleGainDragStart(e, seg) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const initialGain = seg.gain ?? 1;
    gainDragStateRef.current = {
      id: seg.id,
      rectTop: rect.top,
      rectHeight: rect.height || 1,
      currentGain: initialGain,
    };
    setGainDraft({ id: seg.id, gain: initialGain });
    window.addEventListener("mousemove", handleGainDragMove);
    window.addEventListener("mouseup", handleGainDragEnd);
  }

  function handleGainDragMove(e) {
    const state = gainDragStateRef.current;
    if (!state) return;
    // 위쪽일수록 볼륨이 커지고(fraction→1), 아래쪽일수록 작아집니다(fraction→0).
    const fraction = 1 - Math.max(0, Math.min(1, (e.clientY - state.rectTop) / state.rectHeight));
    const gain = Math.max(MIN_CLIP_GAIN, Math.min(MAX_CLIP_GAIN, Math.round(fraction * MAX_CLIP_GAIN * 100) / 100));
    state.currentGain = gain;
    setGainDraft({ id: state.id, gain });
  }

  function handleGainDragEnd() {
    const state = gainDragStateRef.current;
    gainDragStateRef.current = null;
    window.removeEventListener("mousemove", handleGainDragMove);
    window.removeEventListener("mouseup", handleGainDragEnd);
    if (state) {
      onChange(segments.map((s) => (s.id === state.id ? { ...s, gain: state.currentGain } : s)));
    }
    setGainDraft(null);
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
                onClick={(e) => handleSegmentClick(e, seg, idx)}
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
          const effectiveGain =
            gainDraft?.id === seg.id ? gainDraft.gain : seg.gain ?? 1;
          const gainHandleTopPercent = (1 - Math.min(1, effectiveGain / MAX_CLIP_GAIN)) * 100;
          return (
            <div
              key={seg.id}
              draggable
              onDragStart={() => handleDragStart(seg.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropOn(seg.id)}
              onClick={(e) => handleSegmentClick(e, seg, idx)}
              style={{ width: `${widthPercent}%`, ...(cutMode ? { cursor: SCISSORS_CURSOR } : {}) }}
              className={`group relative flex h-full min-w-[96px] cursor-pointer flex-col justify-end overflow-hidden rounded-md border-2 px-1 pb-1 transition ${
                isSelected ? "border-amber-700 bg-amber-50" : "border-stone-200 bg-stone-50 hover:border-stone-300"
              }`}
              title={segmentLabel(seg, idx)}
            >
              <div className="pointer-events-none absolute left-1 top-1 flex items-center gap-0.5 text-stone-400">
                <GripVertical size={11} />
              </div>

              {/* 클립 통째로 완전 삭제 — 편집용 2단계 삭제(선택 후 삭제)와는 별개의 빠른 삭제.
                  미리듣기는 상단의 재생 버튼(붉은 원)으로 충분해서 별도 버튼은 두지 않습니다. */}
              <div className="absolute right-1 top-1 flex items-center gap-1.5">
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
                    style={{ height: `${Math.min(100, v * effectiveGain)}%` }}
                  />
                ))}
              </div>

              {/* 클립 중앙의 볼륨 슬라이더 — 수직선을 위/아래로 드래그하면 이
                  클립만의 볼륨이 오르내립니다(가운데=100%, 위쪽 끝=200%,
                  아래쪽 끝=음소거). */}
              <div
                onMouseDown={(e) => handleGainDragStart(e, seg)}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-y-1.5 left-1/2 z-10 flex w-6 -translate-x-1/2 cursor-ns-resize items-start justify-center"
                title={`볼륨 ${Math.round(effectiveGain * 100)}% (드래그해서 조절)`}
              >
                <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-stone-400/50 group-hover:bg-stone-500/70" />
                <div
                  className="pointer-events-none absolute left-1/2 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-amber-600 shadow"
                  style={{ top: `${gainHandleTopPercent}%` }}
                >
                  <GripHorizontal size={8} className="text-white" />
                </div>
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
    </div>
  );
}
