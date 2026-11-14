"use client";

// 편집 타임라인(마그네틱) — 목소리 클립 줄 + (있으면) 배경음악 줄, 그 위를 지나는 재생선.
// 모든 위치는 TimeAxis 하나로 계산합니다: 클립은 시작 시간·길이 비율로 정확히 놓이고(간격·최소 폭
// 없음), 파형은 클립 상자에 꼭 맞게 그려지며, 자르기 표시선·재생선·클릭 위치가 같은 기준을 써서
// "보이는 선 = 실제로 잘리는 곳"이 됩니다.
//
// 모드: 선택(기본) · 자르기(빨간 표시선이 마우스를 따라오고 누르면 그 자리에서 자름) ·
//       트리밍(클립 양쪽 가장자리를 좌우로 끌어 앞/뒤를 줄이거나 잘린 부분을 다시 늘림).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Scissors,
  Magnet,
  Trash2,
  Play,
  Pause,
  GripVertical,
  Music,
  Move,
  GripHorizontal,
  ZoomIn,
  ZoomOut,
  UnfoldHorizontal,
  Upload,
  AudioLines,
} from "lucide-react";
import WaveformCanvas from "@/components/studio/WaveformCanvas";
import { BackgroundMixer, ClipGain, TimeFormat, WaveformAnalyzer } from "@/lib/audio";
import { FileDrop, FileKind } from "@/lib/fileDrop";
import {
  ClipTrim,
  FocusGuard,
  PointerDrag,
  PreviewPlayer,
  Segment,
  TimeAxis,
  Timeline,
  TimelineZoom,
} from "@/lib/timeline";

// 드래그로 조정할 수 있는 "배경음악 인트로" 길이의 최소/최대값(초).
const MIN_VOICE_OFFSET = 0;
const MAX_VOICE_OFFSET = 30;

// 자르기 모드에서 마우스가 재생선에서 이 픽셀 이내면 재생선 위치로 자석처럼 붙습니다.
const CUT_SNAP_PIXELS = 10;

const MODE = Object.freeze({ SELECT: "select", CUT: "cut", TRIM: "trim" });

/** 볼륨 손잡이 옆의 수치(0% 기준 ±5%) — 끄는 동안은 크고 진하게. */
function VolumeBadge({ gain, active, tone }) {
  const colors = tone === "sky" ? "bg-sky-600 text-white" : "bg-night-700 text-white";
  return (
    <span
      className={`pointer-events-none absolute left-full ml-0.5 -translate-y-1/2 whitespace-nowrap rounded px-1 tabular-nums shadow-sm transition ${
        active ? `${colors} text-[11px] font-semibold` : "bg-white/85 text-[10px] text-stone-600"
      }`}
      style={{ top: `${ClipGain.handleTopPercent(gain)}%` }}
    >
      {ClipGain.label(gain)}
    </span>
  );
}

export default function ClipTimeline({
  segments,
  onChange,
  backgroundBuffer = null,
  backgroundName = "",
  backgroundVolume = 1,
  onBackgroundVolumeChange = () => {},
  voiceOffsetSeconds = BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS,
  onVoiceOffsetChange = () => {},
  onDropFiles = null, // (files) => void — 오디오 파일을 타임라인에 끌어다 놓으면 클립으로 추가
  backgroundPending = false, // 배경음악을 골랐는데 아직 불러오는 중
  onRequestBackground = null, // 빈 배경음악 트랙의 [배경음악 고르기] — 라이브러리로 이동
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState(MODE.SELECT);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [dragId, setDragId] = useState(null);
  const [isDraggingOffset, setIsDraggingOffset] = useState(false);
  const [gainDraft, setGainDraft] = useState(null); // { id, gain } — 드래그 중 미리보기 값
  const [bgVolumeDraft, setBgVolumeDraft] = useState(null); // 드래그 중 미리보기 값 (0~ClipGain.MAX)
  const [zoomLevel, setZoomLevel] = useState(TimelineZoom.MIN); // 100~3200(%) — 가로 확대 배율
  const [cutHover, setCutHover] = useState(null); // { seconds, snapped, valid } — 자르기 표시선
  const [trimDraft, setTrimDraft] = useState(null); // { id, inSample, outSample, axisSeconds, edge }
  const [isFileOver, setIsFileOver] = useState(false);
  const trackRowRef = useRef(null);
  const railRef = useRef(null);
  const zoomWrapperRef = useRef(null);
  const playerRef = useRef(null);
  const rafRef = useRef(null);
  const firstRenderRef = useRef(true);
  // 진행 중인 마우스 드래그(인트로 길이 / 클립 볼륨 / 배경음악 볼륨 / 트리밍) — 한 번에 하나뿐입니다.
  const pointerDragRef = useRef(null);

  function player() {
    if (!playerRef.current) playerRef.current = new PreviewPlayer();
    return playerRef.current;
  }

  // 편집은 항상 실제 segments로, 화면 배치는 트리밍 중이면 끌고 있는 길이를 반영한 것으로.
  const editTimeline = new Timeline(segments);
  const shownSegments = trimDraft
    ? segments.map((s) => (s.id === trimDraft.id ? Segment.preview(s, trimDraft.inSample, trimDraft.outSample) : s))
    : segments;
  const timeline = new Timeline(shownSegments);
  const voiceSeconds = timeline.totalSeconds;
  const hasGap = editTimeline.hasGap;
  const selected = editTimeline.find(selectedId);

  const hasBackground = Boolean(backgroundBuffer);
  // 배경음악이 있으면 [인트로(배경음악만)] + [목소리] + [페이드아웃 꼬리]가 실제로 재생되는 길이입니다.
  const leadSeconds = hasBackground ? voiceOffsetSeconds : 0;
  const tailSeconds = hasBackground && voiceSeconds > 0 ? BackgroundMixer.FADE_OUT_SECONDS : 0;
  // 트리밍 중에는 화면 배율을 고정해서(전체 길이가 바뀌어도) 끄는 손과 가장자리가 어긋나지 않게 합니다.
  // 실제 믹싱과 같은 시간별 배경음악 볼륨(배경음악 트랙 파형에 그대로 반영).
  const backgroundMixer = new BackgroundMixer({ volume: backgroundVolume, voiceOffsetSeconds });
  const axis = new TimeAxis(trimDraft?.axisSeconds ?? leadSeconds + voiceSeconds + tailSeconds);

  // 실제로 재생되는 소리 — 디코딩한 클립 + 빈 공간의 진짜 무음, 배경음악이 있으면 저장과 같은 믹스.
  const previewBuffer = useMemo(() => {
    const voice = new Timeline(segments).toBuffer();
    if (!voice) return null;
    if (!backgroundBuffer) return voice;
    return new BackgroundMixer({ volume: backgroundVolume, voiceOffsetSeconds }).mix(voice, backgroundBuffer);
  }, [segments, backgroundBuffer, backgroundVolume, voiceOffsetSeconds]);

  // 배경음악 줄 파형 — 실제 믹싱과 똑같이 전체 길이에 맞춰 반복/트림된 모양.
  const backgroundWaveform = useMemo(
    () => {
      if (!backgroundBuffer || axis.seconds <= 0) return null;
      // 1초에 4개쯤(전체 최대 600개) — 3초 뒤 낮추기·페이드아웃이 파형에서 보일 만큼 촘촘하게.
      const totalBars = Math.min(600, Math.max(48, Math.round(axis.seconds * 4)));
      const barsPerLoop = Math.max(1, Math.round((totalBars * backgroundBuffer.duration) / axis.seconds));
      return WaveformAnalyzer.tiledPeaks(backgroundBuffer, axis.seconds, barsPerLoop);
    },
    [backgroundBuffer, axis.seconds]
  );

  function stopPlayback() {
    playerRef.current?.stop();
    cancelAnimationFrame(rafRef.current);
  }

  // 확대된 타임라인 안에서 재생선이 화면 가장자리에 가까워지면 스크롤이 따라가게 합니다.
  function scrollPlayheadIntoView(seconds, { force = false } = {}) {
    const wrapper = zoomWrapperRef.current;
    if (!wrapper) return;
    const scrollWidth = wrapper.scrollWidth;
    const clientWidth = wrapper.clientWidth;
    if (scrollWidth <= clientWidth) return;
    const playheadPx = (axis.percentOf(seconds) / 100) * scrollWidth;
    const centered = Math.max(0, Math.min(scrollWidth - clientWidth, playheadPx - clientWidth / 2));
    if (force) {
      wrapper.scrollLeft = centered;
      return;
    }
    // 재생 중 따라가기 — 세로선이 화면 오른쪽 끝(또는 왼쪽 밖)에 닿을 때만 한 화면씩 넘깁니다.
    // 화면 안을 눌러 옮긴 세로선은 그 자리에 그대로 있습니다.
    const viewStart = wrapper.scrollLeft;
    if (playheadPx < viewStart || playheadPx > viewStart + clientWidth - 4) {
      wrapper.scrollLeft = Math.max(0, Math.min(scrollWidth - clientWidth, playheadPx - clientWidth * 0.1));
    }
  }

  function tick() {
    const p = player();
    if (!p.isActive || !p.buffer) return;
    const seconds = Math.min(p.buffer.duration, p.elapsedSeconds);
    setPlayheadSeconds(seconds);
    scrollPlayheadIntoView(seconds);
    if (seconds >= p.buffer.duration) {
      stopPlayback();
      setIsPlaying(false);
      setPlayheadSeconds(0);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function playFrom(offsetSeconds) {
    cancelAnimationFrame(rafRef.current);
    if (!player().play(previewBuffer, offsetSeconds)) return;
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
      return;
    }
    // 끝에 서 있으면(편집으로 전체가 짧아진 경우 포함) 처음부터.
    playFrom(playheadSeconds >= axis.seconds - 0.05 ? 0 : playheadSeconds);
  }

  // 스페이스바 리스너는 마운트 때 한 번만 등록되므로, 최신 togglePlay를 ref로 부릅니다.
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => {
    togglePlayRef.current = togglePlay;
  });

  // 녹음/업로드 직후 마음에 들지 않는 클립을 곧바로 완전히 삭제(빈 공간 없이 뒤 클립이 당겨짐).
  function deleteClipEntirely(id) {
    onChange(editTimeline.remove(id));
    if (selectedId === id) setSelectedId(null);
  }

  // 편집 내용(또는 인트로 길이)이 바뀌면 재생을 멈춥니다. 재생선은 그 자리에 둡니다 — 자르기를 하면
  // 자른 지점에 세로선이 서 있어서 바로 그 자리부터 이어 듣거나 다시 자를 수 있습니다.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    stopPlayback();
    setIsPlaying(false);
  }, [segments, backgroundBuffer, voiceOffsetSeconds]);

  useEffect(() => {
    return () => {
      stopPlayback();
      pointerDragRef.current?.dispose();
    };
  }, []);

  // 키보드: +/- 확대·축소, Esc 자르기·트리밍 끝내기 (입력창에 포커스가 있을 때는 무시).
  useEffect(() => {
    function handleKeyDown(e) {
      if (FocusGuard.isTyping()) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoomLevel(TimelineZoom.in);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoomLevel(TimelineZoom.out);
      } else if (e.key === "Escape") {
        setMode(MODE.SELECT);
        setCutHover(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 스페이스바로 재생/정지 (터치 기기 제외, 입력창 포커스 중엔 띄어쓰기 그대로).
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.code !== "Space" && e.key !== " ") return;
      const isTouchDevice = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
      if (isTouchDevice) return;
      if (FocusGuard.isTyping()) return;
      e.preventDefault();
      // 버튼에 포커스가 남아 있으면 스페이스가 그 버튼 클릭으로도 해석돼 "이중 토글"이 되므로 미리 없앱니다.
      const active = document.activeElement;
      if (active?.tagName === "BUTTON" && active instanceof HTMLElement) active.blur();
      togglePlayRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 파형·진행바를 눌러 옮길 때는 화면을 움직이지 않습니다 — 누른 바로 그 자리에 세로선이 섭니다.
  // 재생 중이면 그 자리부터 곧바로 이어서 들려줍니다(재생 중 화면 따라가기는 tick이 맡음).
  function seekTo(seconds) {
    const clamped = Math.max(0, Math.min(axis.seconds, seconds));
    setPlayheadSeconds(clamped);
    if (isPlaying) playFrom(clamped);
  }

  // 진행바 — 누른 곳으로 재생선이 바로 옮겨 가고, 누른 채 좌우로 끌면 재생선이 따라옵니다(스크럽).
  // 재생 중이었다면 끄는 동안 잠깐 멈췄다가 손을 뗀 위치부터 이어서 들려줍니다.
  function handleRailMouseDown(e) {
    if (!railRef.current || !previewBuffer || e.button !== 0) return;
    e.preventDefault();
    const rect = railRef.current.getBoundingClientRect();
    const wasPlaying = isPlaying;
    stopPlayback();
    const at = (clientX) => Math.max(0, Math.min(axis.seconds, axis.secondsAt(clientX, rect)));
    const first = at(e.clientX);
    setPlayheadSeconds(first);
    beginPointerDrag(
      { seconds: first, cursor: "ew-resize" },
      {
        onMove: (ev, state) => {
          state.seconds = at(ev.clientX);
          setPlayheadSeconds(state.seconds);
        },
        onEnd: (ev, state) => {
          if (wasPlaying) playFrom(state.seconds);
        },
      }
    );
  }

  /** 자르기 모드에서 마우스 위치 → 자를 시간. 재생선 근처면 재생선 위치로 붙습니다. */
  function cutTargetAt(clientX) {
    const rect = trackRowRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const seconds = axis.secondsAt(clientX, rect);
    const located = timeline.locate(seconds, leadSeconds);
    if (!located || located.seg.type !== "clip") return null;
    const pps = axis.pixelsPerSecond(rect);
    const playheadInClip =
      playheadSeconds > located.startSeconds && playheadSeconds < located.startSeconds + located.seg.duration;
    const snapped = playheadInClip && Math.abs(seconds - playheadSeconds) * pps <= CUT_SNAP_PIXELS;
    const at = snapped ? playheadSeconds : seconds;
    const offsetSeconds = at - located.startSeconds;
    return { seconds: at, snapped, located, offsetSeconds, valid: Timeline.canSplitAt(located.seg, offsetSeconds) };
  }

  function handleRowMouseMove(e) {
    if (mode !== MODE.CUT) return;
    const target = cutTargetAt(e.clientX);
    setCutHover(target ? { seconds: target.seconds, snapped: target.snapped, valid: target.valid } : null);
  }

  // 줄을 누르면: 자르기 모드에서는 표시선 자리에서 자르고, 아니면 그 구간을 고르고 재생선을 옮깁니다.
  function handleRowClick(e) {
    if (axis.seconds <= 0 || trimDraft) return;
    if (mode === MODE.CUT) {
      const target = cutTargetAt(e.clientX);
      if (!target?.valid) return;
      const result = editTimeline.split(target.located.seg.id, target.offsetSeconds);
      if (!result) return;
      onChange(result.segments);
      setSelectedId(result.leftId);
      setPlayheadSeconds(target.seconds);
      setMode(MODE.SELECT);
      setCutHover(null);
      return;
    }
    const rect = trackRowRef.current.getBoundingClientRect();
    const seconds = axis.secondsAt(e.clientX, rect);
    const located = timeline.locate(seconds, leadSeconds);
    if (located) setSelectedId(located.seg.id === selectedId ? null : located.seg.id);
    seekTo(seconds);
  }

  function deleteSelected() {
    if (!selected) return;
    onChange(editTimeline.deleteSegment(selected.id));
    setSelectedId(null);
  }

  // Delete / Backspace 키로도 선택한 구간을 지웁니다(맥의 delete = Backspace).
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selected) return;
      if (FocusGuard.isTyping()) return;
      e.preventDefault();
      deleteSelected();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function autoJoinAll() {
    onChange(editTimeline.joinAll());
    setSelectedId(null);
  }

  function handleDropOn(targetId) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const next = editTimeline.move(dragId, targetId);
    setDragId(null);
    if (next) onChange(next);
  }

  // 탐색기/Finder에서 오디오 파일을 타임라인 위로 끌어다 놓으면 클립으로 추가합니다.
  function handleFileDragOver(e) {
    if (!onDropFiles || !FileDrop.carriesFiles(e)) return;
    e.preventDefault();
    if (!isFileOver) setIsFileOver(true);
  }

  function handleFileDragLeave(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsFileOver(false);
  }

  function handleFileDrop(e) {
    if (!onDropFiles || !FileDrop.carriesFiles(e)) return;
    e.preventDefault();
    setIsFileOver(false);
    const { accepted, rejected } = FileDrop.split(e.dataTransfer.files, FileKind.AUDIO);
    onDropFiles(accepted, rejected);
  }

  function beginPointerDrag(state, handlers) {
    pointerDragRef.current?.dispose();
    pointerDragRef.current = new PointerDrag(state, {
      onMove: handlers.onMove,
      onEnd: (e, s) => {
        pointerDragRef.current = null;
        handlers.onEnd?.(e, s);
      },
    });
  }

  // 배경음악 인트로 길이 — 하늘색 구간 오른쪽 손잡이를 좌우로 끌어 조정.
  function handleOffsetDragStart(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = trackRowRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    setIsDraggingOffset(true);
    beginPointerDrag(
      { startX: e.clientX, startOffset: voiceOffsetSeconds, secondsPerPixel: axis.seconds / rect.width },
      {
        onMove: (ev, state) => {
          const next = state.startOffset + (ev.clientX - state.startX) * state.secondsPerPixel;
          onVoiceOffsetChange(Math.round(Math.max(MIN_VOICE_OFFSET, Math.min(MAX_VOICE_OFFSET, next)) * 10) / 10);
        },
        onEnd: () => setIsDraggingOffset(false),
      }
    );
  }

  // 클립 볼륨 — 가운데 세로선을 위/아래로. 손을 뗄 때 한 번만 segments에 반영(실행 취소 이력 1칸).
  function handleGainDragStart(e, seg) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const initialGain = seg.gain ?? ClipGain.DEFAULT;
    setGainDraft({ id: seg.id, gain: initialGain });
    beginPointerDrag(
      { id: seg.id, rectTop: rect.top, rectHeight: rect.height, currentGain: initialGain },
      {
        onMove: (ev, state) => {
          state.currentGain = ClipGain.fromPointer(ev.clientY, state.rectTop, state.rectHeight);
          setGainDraft({ id: state.id, gain: state.currentGain });
        },
        onEnd: (ev, state) => {
          onChange(editTimeline.setGain(state.id, state.currentGain));
          setGainDraft(null);
        },
      }
    );
  }

  // 트리밍 — 클립 가장자리를 좌우로 끕니다. 끄는 동안은 화면에만 보여주고 손을 떼면 한 번에 반영.
  // 앞 가장자리를 오른쪽으로 끌면 앞부분이 줄고, 왼쪽으로 끌면 자르기로 잘렸던 부분이 되살아납니다.
  // 뒤 클립들은 마그네틱으로 따라 움직입니다.
  // 손잡이에 붙은 data-seg-id / data-edge로 어느 클립의 어느 쪽인지 찾습니다.
  function handleTrimStart(e) {
    e.preventDefault();
    e.stopPropagation();
    const { segId, edge } = e.currentTarget.dataset;
    const seg = editTimeline.find(segId);
    if (!seg || seg.type !== "clip") return;
    const rect = trackRowRef.current?.getBoundingClientRect();
    const pps = axis.pixelsPerSecond(rect);
    if (!pps) return;
    stopPlayback();
    setIsPlaying(false);
    const start = { id: seg.id, inSample: seg.inSample, outSample: seg.outSample, axisSeconds: axis.seconds, edge };
    setTrimDraft(start);
    beginPointerDrag(
      { ...start, startX: e.clientX, pps, cursor: "ew-resize" },
      {
        onMove: (ev, state) => {
          const range = ClipTrim.range(seg, edge, (ev.clientX - state.startX) / state.pps);
          state.inSample = range.inSample;
          state.outSample = range.outSample;
          setTrimDraft({ ...start, ...range });
        },
        onEnd: (ev, state) => {
          setTrimDraft(null);
          if (state.inSample !== seg.inSample || state.outSample !== seg.outSample) {
            onChange(editTimeline.trim(seg.id, state.inSample, state.outSample));
            setSelectedId(seg.id);
          }
        },
      }
    );
  }

  // 배경음악 볼륨 — 배경음악 줄 가운데 세로선. 끄는 동안 바로 반영(재생 중이면 아래 effect가 다시 재생).
  function handleBgVolumeDragStart(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setBgVolumeDraft(ClipGain.clamp(backgroundVolume));
    beginPointerDrag(
      { rectTop: rect.top, rectHeight: rect.height },
      {
        onMove: (ev, state) => {
          const volume = ClipGain.fromPointer(ev.clientY, state.rectTop, state.rectHeight);
          setBgVolumeDraft(volume);
          onBackgroundVolumeChange(volume);
        },
        onEnd: () => setBgVolumeDraft(null),
      }
    );
  }

  // 배경음악 볼륨이 바뀌었는데 재생 중이면 지금 위치에서 새 볼륨으로 다시 재생합니다.
  const firstBgVolumeRenderRef = useRef(true);
  useEffect(() => {
    if (firstBgVolumeRenderRef.current) {
      firstBgVolumeRenderRef.current = false;
      return undefined;
    }
    if (!isPlaying) return undefined;
    const timer = setTimeout(() => playFrom(playheadSeconds), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundVolume]);

  // 확대 배율이 바뀌면 재생선이 있던 곳이 화면 가운데로 오게 스크롤을 맞춥니다.
  useEffect(() => {
    scrollPlayheadIntoView(playheadSeconds, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel]);

  function toggleMode(next) {
    setMode((current) => (current === next ? MODE.SELECT : next));
    setCutHover(null);
  }

  const playheadPercent = axis.percentOf(Math.min(playheadSeconds, axis.seconds));
  const hasAnything = axis.seconds > 0;
  const isCut = mode === MODE.CUT;
  const isTrim = mode === MODE.TRIM;

  const modeHint = isCut
    ? "빨간 표시선이 있는 곳을 누르면 정확히 그 자리에서 잘려요. 재생선 가까이 가면 재생선에 붙어요. (Esc: 그만)"
    : isTrim
    ? "클립 양쪽 가장자리에 마우스를 올리면 ↔ 모양이 돼요. 누른 채 좌우로 끌면 앞·뒤가 줄거나, 잘린 부분이 다시 늘어나요. (Esc: 그만)"
    : "";

  return (
    <div
      className={`rounded-xl border bg-white p-4 transition ${isFileOver ? "border-night-500 ring-2 ring-night-200" : "border-stone-200"}`}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          disabled={voiceSeconds === 0}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-night-700 text-white hover:bg-night-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          aria-label={isPlaying ? "정지" : "재생"}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <span className="text-xs tabular-nums text-stone-400">
          {TimeFormat.precise(playheadSeconds)} / {TimeFormat.precise(axis.seconds)}
        </span>

        <button
          type="button"
          onClick={() => toggleMode(MODE.CUT)}
          disabled={voiceSeconds === 0}
          aria-pressed={isCut}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
            isCut ? "border-red-400 bg-red-50 text-red-700" : "border-stone-300 text-stone-600 hover:bg-stone-100"
          }`}
        >
          <Scissors size={13} /> 자르기
        </button>

        <button
          type="button"
          onClick={() => toggleMode(MODE.TRIM)}
          disabled={voiceSeconds === 0}
          aria-pressed={isTrim}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
            isTrim ? "border-amber-400 bg-amber-50 text-amber-800" : "border-stone-300 text-stone-600 hover:bg-stone-100"
          }`}
        >
          <UnfoldHorizontal size={13} /> 트리밍
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
          className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Magnet size={13} /> 자동으로 붙이기
        </button>

        {/* 파형 가로 확대 — 길이는 그대로, 그리는 폭만 넓혀 아주 짧은 순간까지 자를 수 있게(키보드 +/-). */}
        <div className="ml-auto flex items-center gap-1 rounded-full border border-stone-300 px-1 py-1">
          <button
            type="button"
            onClick={() => setZoomLevel(TimelineZoom.out)}
            disabled={zoomLevel <= TimelineZoom.MIN}
            className="flex h-6 w-6 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="파형 축소"
            title="파형 축소 (키보드 -)"
          >
            <ZoomOut size={13} />
          </button>
          <span className="w-11 text-center text-[11px] tabular-nums text-stone-400">{zoomLevel}%</span>
          <button
            type="button"
            onClick={() => setZoomLevel(TimelineZoom.in)}
            disabled={zoomLevel >= TimelineZoom.MAX}
            className="flex h-6 w-6 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="파형 확대"
            title="파형 확대 (키보드 +)"
          >
            <ZoomIn size={13} />
          </button>
        </div>
      </div>

      {modeHint && <p className={`mt-2 text-xs ${isCut ? "text-red-600" : "text-amber-700"}`}>{modeHint}</p>}

      {/* 진행바 + 목소리 줄 + 배경음악 줄 — 모두 같은 시간축. 진행바도 확대 영역 안에 있어서 확대하면
          함께 넓어지고 함께 스크롤되므로, 진행바의 위치와 파형 위 세로선이 언제나 같은 자리에 있습니다. */}
      <div ref={zoomWrapperRef} className="relative mt-4 overflow-x-auto">
        <div className="relative" style={{ width: `${zoomLevel}%` }}>
          <div
            ref={railRef}
            onMouseDown={handleRailMouseDown}
            className="relative mb-2 h-3 cursor-pointer rounded-full bg-stone-100"
            title="누르거나 끌어서 재생 위치 옮기기"
          >
            <div className="pointer-events-none absolute top-0 h-3 rounded-full bg-night-200" style={{ width: `${playheadPercent}%` }} />
          </div>
          {/* 트랙 이름 — 확대해서 옆으로 스크롤해도 왼쪽에 붙어 있습니다. */}
          <div className="h-5">
            <span className="sticky left-0 inline-flex items-center gap-1 text-[10px] font-semibold text-night-700">
              <AudioLines size={11} /> 오디오 트랙
            </span>
          </div>
          <div
            ref={trackRowRef}
            onClick={handleRowClick}
            onMouseMove={handleRowMouseMove}
            onMouseLeave={() => setCutHover(null)}
            className="relative h-32 overflow-hidden rounded-lg bg-stone-50/60"
            style={{ cursor: isCut ? "crosshair" : undefined }}
          >
            {hasBackground && hasAnything && (
              <div
                style={{ left: 0, width: `${axis.percentOf(leadSeconds)}%` }}
                className={`absolute inset-y-0 flex items-center justify-center rounded-md border-2 border-dashed transition ${
                  isDraggingOffset ? "border-sky-500 bg-sky-50" : "border-sky-200 bg-sky-50/60"
                }`}
                title="배경음악만 먼저 나오는 구간 — 오른쪽 손잡이를 드래그해서 길이를 조정하세요"
              >
                {axis.percentOf(leadSeconds) > 6 && (
                  <span className="pointer-events-none px-1 text-center text-[10px] leading-tight text-sky-500">
                    배경음악
                    <br />
                    {voiceOffsetSeconds.toFixed(1)}초
                  </span>
                )}
              </div>
            )}

            {shownSegments.map((seg, idx) => {
              const startSeconds = timeline.startSecondsOf(idx, leadSeconds);
              const box = { left: `${axis.percentOf(startSeconds)}%`, width: `${axis.percentOf(seg.duration || 0)}%` };
              const isSelected = seg.id === selectedId;
              if (seg.type === "gap") {
                return (
                  <div
                    key={seg.id}
                    style={box}
                    className={`absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md border-2 border-dashed text-[10px] text-stone-400 ${
                      isSelected ? "border-night-600 bg-night-50" : "border-stone-300 bg-stone-50"
                    }`}
                    title="빈 공간 — 선택 후 삭제하면 옆 클립끼리 이어붙습니다"
                  >
                    빈 공간
                  </div>
                );
              }
              const effectiveGain = gainDraft?.id === seg.id ? gainDraft.gain : seg.gain ?? ClipGain.DEFAULT;
              const isTrimming = trimDraft?.id === seg.id;
              const hidden = Segment.hiddenEdges(seg);
              const canReorder = mode === MODE.SELECT;
              return (
                <div
                  key={seg.id}
                  draggable={canReorder}
                  onDragStart={(e) => {
                    if (!canReorder) return;
                    e.dataTransfer.setData("text/plain", seg.id);
                    setDragId(seg.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => dragId && e.preventDefault()}
                  onDrop={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    handleDropOn(seg.id);
                  }}
                  style={box}
                  className="group absolute inset-y-0 overflow-hidden rounded-md bg-white"
                  title={Segment.label(seg, idx)}
                >
                  {/* 파형은 상자에 꼭 맞게(여백 없이) — 상자의 x 위치가 곧 시간입니다. */}
                  <WaveformCanvas
                    peaks={seg.peaks}
                    startSample={seg.inSample}
                    endSample={seg.outSample}
                    gain={effectiveGain}
                    className={`absolute inset-0 ${isSelected || isTrimming ? "text-night-500" : "text-night-300"}`}
                  />
                  {/* 테두리는 위에 덮어 그려서 파형 위치를 밀지 않습니다. */}
                  <div
                    className={`pointer-events-none absolute inset-0 rounded-md border-2 ${
                      isTrimming ? "border-amber-500" : isSelected ? "border-night-700" : "border-stone-200 group-hover:border-stone-300"
                    }`}
                  />

                  <div className="pointer-events-none absolute left-1 top-1 text-stone-400">
                    <GripVertical size={11} />
                  </div>

                  {/* 클립 통째로 완전 삭제(빈 공간 없이). */}
                  {!isTrim && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteClipEntirely(seg.id);
                      }}
                      className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-500 shadow-sm hover:bg-red-50 hover:text-red-600"
                      aria-label="클립 전체 삭제"
                      title="이 클립 전체 삭제"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}

                  {/* 클립 볼륨 — 가운데 세로선(가운데=0%, 위로 +5%씩 최대 +100%, 아래로 -5%씩 최저 -100%=음소거). */}
                  {mode === MODE.SELECT && (
                    <div
                      onMouseDown={(e) => handleGainDragStart(e, seg)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-y-1.5 left-1/2 z-10 flex w-6 -translate-x-1/2 cursor-ns-resize items-start justify-center"
                      title={`볼륨 ${ClipGain.label(effectiveGain)} (위아래로 끌어서 5%씩 조절)`}
                    >
                      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-stone-400/50 group-hover:bg-stone-500/70" />
                      <div
                        className="pointer-events-none absolute left-1/2 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-night-600 shadow"
                        style={{ top: `${ClipGain.handleTopPercent(effectiveGain)}%` }}
                      >
                        <GripHorizontal size={8} className="text-white" />
                      </div>
                      <VolumeBadge gain={effectiveGain} active={gainDraft?.id === seg.id} tone="night" />
                    </div>
                  )}

                  {/* 트리밍 손잡이 — 양쪽 가장자리. 잘려서 숨은 부분이 있는 쪽은 진하게 보여요. */}
                  {isTrim &&
                    [ClipTrim.EDGES.START, ClipTrim.EDGES.END].map((edge) => {
                      const isStart = edge === ClipTrim.EDGES.START;
                      const strong = isStart ? hidden.start : hidden.end;
                      return (
                        <div
                          key={edge}
                          data-seg-id={seg.id}
                          data-edge={edge}
                          onMouseDown={handleTrimStart}
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute inset-y-0 z-20 flex w-3 cursor-ew-resize items-center justify-center ${isStart ? "left-0" : "right-0"}`}
                          title={isStart ? "앞부분 트리밍 — 좌우로 끌기" : "뒷부분 트리밍 — 좌우로 끌기"}
                          aria-label={isStart ? "앞부분 트리밍" : "뒷부분 트리밍"}
                        >
                          <span
                            className={`h-full w-1.5 ${isStart ? "rounded-l-md" : "rounded-r-md"} ${
                              strong ? "bg-amber-500" : "bg-amber-300/70"
                            }`}
                          />
                        </div>
                      );
                    })}

                  <div className="pointer-events-none absolute bottom-1 right-1 rounded bg-white/70 px-1 text-[10px] tabular-nums text-stone-500">
                    {isTrimming ? TimeFormat.precise(seg.duration) : TimeFormat.duration(seg.duration)}
                  </div>
                </div>
              );
            })}

            {hasBackground && tailSeconds > 0 && (
              <div
                style={{ left: `${axis.percentOf(leadSeconds + voiceSeconds)}%`, width: `${axis.percentOf(tailSeconds)}%` }}
                className="pointer-events-none absolute inset-y-0 flex items-center justify-center rounded-md border-2 border-dashed border-sky-100 text-center text-[10px] leading-tight text-sky-400"
                title="목소리가 끝난 뒤 배경음악이 서서히 작아지는 구간"
              >
                {axis.percentOf(tailSeconds) > 6 && "페이드아웃"}
              </div>
            )}

            {segments.length === 0 && (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-stone-400">
                {onDropFiles && <Upload size={16} />}
                녹음하거나 파일을 업로드하면 실제 파형이 여기에 표시됩니다.
                {onDropFiles && <span>오디오 파일을 여기로 끌어다 놓아도 돼요.</span>}
              </div>
            )}
          </div>

          {/* 인트로 길이 손잡이 — 줄의 overflow에 잘리지 않도록 줄 밖(같은 좌표)에 둡니다. */}
          {hasBackground && hasAnything && (
            <button
              type="button"
              onMouseDown={handleOffsetDragStart}
              className="absolute top-[104px] z-20 flex h-7 w-5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-sky-500 text-white shadow hover:bg-sky-600"
              style={{ left: `${axis.percentOf(leadSeconds)}%` }}
              aria-label="배경음악 인트로 길이 조정"
              title="드래그해서 목소리가 시작되는 시점을 조정하세요"
            >
              <Move size={11} />
            </button>
          )}

          {/* 배경음악 트랙 — 오디오 트랙과 같은 폭(같은 시간축). 언제나 보이고, 곡을 올리기 전에는 비어 있습니다.
              가운데 세로선으로 배경음악 전체 볼륨을 조절합니다. */}
          {(() => {
            const effectiveBgVolume = bgVolumeDraft ?? ClipGain.clamp(backgroundVolume);
            const hasWave = Boolean(backgroundWaveform && backgroundWaveform.length > 0);
            return (
              <div className={`mt-1 rounded-lg p-1.5 ${hasWave ? "bg-sky-50" : "border border-dashed border-sky-200 bg-sky-50/40"}`}>
                <div className="mb-1 h-4">
                  <span className="sticky left-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700">
                    <Music size={11} /> 배경음악 트랙
                    {hasWave && (
                      <span className="font-medium text-sky-600">
                        · {backgroundName || "배경음악"} · 목소리는 {voiceOffsetSeconds.toFixed(1)}초 후 시작 · 볼륨{" "}
                        {ClipGain.label(effectiveBgVolume)}
                      </span>
                    )}
                  </span>
                </div>
                {hasWave ? (
                  <div className="relative flex h-16 items-end gap-[1px] overflow-hidden">
                    {/* 배경음악 파형도 볼륨만큼 커지고 작아집니다(오디오 트랙과 같은 척도: 0%일 때 절반 높이).
                        여기에 실제 믹싱의 시간별 볼륨(3초 뒤 낮추기, 끝난 뒤 페이드아웃)까지 곱해서 그립니다. */}
                    {backgroundWaveform.map((v, i) => {
                      const t = ((i + 0.5) / backgroundWaveform.length) * axis.seconds;
                      const level = backgroundMixer.levelAt(t, voiceSeconds);
                      return (
                        <span
                          key={i}
                          className="w-full rounded-sm bg-sky-300"
                          style={{ height: `max(1px, ${(v * effectiveBgVolume * level) / ClipGain.MAX}%)` }}
                        />
                      );
                    })}
                    <div
                      onMouseDown={handleBgVolumeDragStart}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-y-0 left-1/2 z-10 flex w-6 -translate-x-1/2 cursor-ns-resize items-start justify-center"
                      title={`배경음악 볼륨 ${ClipGain.label(effectiveBgVolume)} (위아래로 끌어서 5%씩 조절)`}
                    >
                      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-sky-500/60" />
                      <div
                        className="pointer-events-none absolute left-1/2 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-sky-600 shadow"
                        style={{ top: `${ClipGain.handleTopPercent(effectiveBgVolume)}%` }}
                      >
                        <GripHorizontal size={8} className="text-white" />
                      </div>
                      <VolumeBadge gain={effectiveBgVolume} active={bgVolumeDraft !== null} tone="sky" />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-16 items-center">
                    <span className="sticky left-1.5 inline-flex flex-wrap items-center gap-2 text-xs text-sky-700/80">
                      {backgroundPending ? (
                        "배경음악을 불러오는 중…"
                      ) : (
                        <>
                          비어 있어요 — 아래 배경음악 라이브러리에서 곡의 <b className="font-semibold">[트랙에 올리기]</b>를 누르세요.
                          {onRequestBackground && (
                            <button
                              type="button"
                              onClick={onRequestBackground}
                              className="flex items-center gap-1 rounded-full border border-sky-300 bg-white px-2.5 py-1 text-xs font-medium text-sky-700"
                            >
                              <Music size={12} /> 배경음악 고르기
                            </button>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 재생선 — 두 줄을 함께 관통. 자르기 표시선이 재생선에 붙으면 빨갛게 도드라집니다. */}
          {hasAnything && (
            <div
              className={`pointer-events-none absolute inset-y-0 -translate-x-1/2 ${
                isCut && cutHover?.snapped ? "w-0.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" : "w-0.5 bg-night-700/70"
              }`}
              style={{ left: `${playheadPercent}%` }}
            >
              {/* 진행바 위의 손잡이 — 세로선과 한 몸이라 어긋날 수 없습니다. */}
              <span className="absolute -top-1 left-1/2 h-5 w-1 -translate-x-1/2 rounded-full bg-night-700" />
            </div>
          )}

          {/* 자르기 표시선 — 마우스를 따라오며, 누르면 정확히 이 선에서 잘립니다(시간은 1/100초까지). */}
          {isCut && cutHover && (
            <div
              className="pointer-events-none absolute top-10 z-30 h-32 -translate-x-1/2"
              style={{ left: `${axis.percentOf(cutHover.seconds)}%` }}
            >
              <div className={`mx-auto h-full w-px ${cutHover.valid ? "bg-red-600" : "bg-stone-400"}`} />
              <div
                className={`absolute left-1/2 top-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white shadow ${
                  cutHover.valid ? "bg-red-600" : "bg-stone-400"
                }`}
              >
                <Scissors size={10} /> {TimeFormat.precise(cutHover.seconds)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
