"use client";

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
} from "lucide-react";
import { BackgroundMixer, ClipGain, TimeFormat, WaveformAnalyzer } from "@/lib/audio";
import {
  FocusGuard,
  PointerDrag,
  PreviewPlayer,
  Segment,
  Timeline,
  TimelineZoom,
} from "@/lib/timeline";

// 드래그로 조정할 수 있는 "배경음악 인트로" 길이의 최소/최대값(초).
const MIN_VOICE_OFFSET = 0;
const MAX_VOICE_OFFSET = 30;

// 자르기 모드에서 클릭(또는 마우스가 가까이 다가온) 지점이 재생 헤드(현재
// 위치선)에서 이 픽셀 이내면, 마치 자석처럼 그 정확한 위치로 달라붙습니다.
const CUT_SNAP_PIXELS = 14;

// 자르기 모드에서 클립 위에 마우스를 올렸을 때 보여줄 가위 모양 커서.
// 실제 이미지 파일 없이 SVG를 데이터 URI로 인라인해서 씁니다.
const SCISSORS_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="%23b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>') 2 2, crosshair`;

export default function ClipTimeline({
  segments,
  onChange,
  backgroundBuffer = null,
  backgroundName = "",
  backgroundVolume = 1,
  onBackgroundVolumeChange = () => {},
  voiceOffsetSeconds = BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS,
  onVoiceOffsetChange = () => {},
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [cutMode, setCutMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPercent, setPlayheadPercent] = useState(0);
  const [dragId, setDragId] = useState(null);
  const [isDraggingOffset, setIsDraggingOffset] = useState(false);
  const [gainDraft, setGainDraft] = useState(null); // { id, gain } — 드래그 중 미리보기 값
  const [bgVolumeDraft, setBgVolumeDraft] = useState(null); // 드래그 중 미리보기 값 (0~ClipGain.MAX)
  const [zoomLevel, setZoomLevel] = useState(TimelineZoom.MIN); // 100~3200(%) — 가로 확대 배율
  const [snapActive, setSnapActive] = useState(false); // 자르기 모드에서 재생 헤드에 자석처럼 붙었는지
  const railRef = useRef(null);
  const trackRowRef = useRef(null);
  const zoomWrapperRef = useRef(null);
  const playerRef = useRef(null);
  const rafRef = useRef(null);
  const firstRenderRef = useRef(true);
  // 진행 중인 마우스 드래그(인트로 길이 / 클립 볼륨 / 배경음악 볼륨) — 한 번에 하나뿐입니다.
  const pointerDragRef = useRef(null);

  function player() {
    if (!playerRef.current) playerRef.current = new PreviewPlayer();
    return playerRef.current;
  }

  const timeline = new Timeline(segments);
  const totalSeconds = timeline.totalSeconds;
  const hasGap = timeline.hasGap;
  const selected = timeline.find(selectedId);

  const hasBackground = Boolean(backgroundBuffer);
  // 배경음악이 있으면 "배경음악 인트로(voiceOffsetSeconds) + 목소리 길이"가 전체
  // 타임라인 길이가 됩니다 — 배경음악은 맨 앞부터 바로 나오고, 목소리는 그 뒤에
  // 이어서 시작하는 구조라서요. 배경음악이 없으면 예전처럼 목소리 길이만큼입니다.
  const leadSeconds = hasBackground ? voiceOffsetSeconds : 0;
  const timelineSeconds = leadSeconds + totalSeconds;

  // Real, continuous audio built from the actual decoded clips + real
  // silence for gaps — this is what actually plays, not a fake timer.
  // When a real background track is provided, it's mixed in too (background
  // first, voice starting voiceOffsetSeconds later), so this play button
  // previews the same thing the final save would produce.
  const previewBuffer = useMemo(() => {
    const voice = new Timeline(segments).toBuffer();
    if (!voice) return null;
    if (!backgroundBuffer) return voice;
    return new BackgroundMixer({ volume: backgroundVolume, voiceOffsetSeconds }).mix(voice, backgroundBuffer);
  }, [segments, backgroundBuffer, backgroundVolume, voiceOffsetSeconds]);

  // 배경음악 트랙을 화면에 두 번째 줄로 보여주기 위한 파형 — 실제 믹싱 때와 똑같이
  // 전체 타임라인 길이(인트로 + 목소리)에 맞춰 반복/트림된 모양으로 미리 계산합니다.
  const backgroundWaveform = useMemo(
    () => (backgroundBuffer ? WaveformAnalyzer.tiledPeaks(backgroundBuffer, timelineSeconds) : null),
    [backgroundBuffer, timelineSeconds]
  );

  // 재생 헤드 라벨은 (배경음악이 있으면) 실제로 재생되는 최종 믹스 길이를 기준으로
  // 보여줘야 정확합니다 — 인트로만큼 목소리 길이보다 더 길어지기 때문입니다.
  const displayTotalSeconds = previewBuffer ? previewBuffer.duration : totalSeconds;

  function stopPlayback() {
    playerRef.current?.stop();
    cancelAnimationFrame(rafRef.current);
  }

  // 확대된 타임라인 안에서 재생 헤드가 화면 가장자리에 가까워지면 스크롤이
  // 따라가게 합니다. React effect(의존성: playheadPercent)로 만들면 재생 중
  // 1초에 60번씩 effect 커밋을 거치면서 헤더가 멈춘 것처럼 보이다가 정지했을 때
  // 한꺼번에 따라잡는 문제가 있어서, 재생 루프(tick)와 각 seek 지점에서 직접
  // 호출합니다.
  function scrollPlayheadIntoView(pct, { force = false } = {}) {
    const wrapper = zoomWrapperRef.current;
    if (!wrapper) return;
    const scrollWidth = wrapper.scrollWidth;
    const clientWidth = wrapper.clientWidth;
    if (scrollWidth <= clientWidth) return;
    const playheadPx = (pct / 100) * scrollWidth;
    const centered = Math.max(0, Math.min(scrollWidth - clientWidth, playheadPx - clientWidth / 2));
    if (force) {
      wrapper.scrollLeft = centered;
      return;
    }
    const viewStart = wrapper.scrollLeft;
    const viewEnd = viewStart + clientWidth;
    const margin = clientWidth * 0.15;
    if (playheadPx < viewStart + margin || playheadPx > viewEnd - margin) {
      wrapper.scrollLeft = centered;
    }
  }

  function tick() {
    const p = player();
    if (!p.isActive || !p.buffer) return;
    const pct = Math.min(100, (p.elapsedSeconds / p.buffer.duration) * 100);
    setPlayheadPercent(pct);
    scrollPlayheadIntoView(pct);
    if (pct >= 100) {
      stopPlayback();
      setIsPlaying(false);
      setPlayheadPercent(0);
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
    playFrom((playheadPercent / 100) * (previewBuffer?.duration || 0));
  }

  // 아래 스페이스바 keydown 리스너는 마운트 시 한 번만 등록되기 때문에, 그
  // 안에서 togglePlay를 직접 부르면 "마운트 당시의" isPlaying/previewBuffer만
  // 계속 참조하는 stale closure 버그가 생깁니다. 매 렌더마다 최신 togglePlay를
  // ref에 담아두고, 리스너는 그 ref를 통해서만 호출합니다.
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => {
    togglePlayRef.current = togglePlay;
  });

  // 녹음/업로드 직후 마음에 들지 않는 클립을 곧바로 완전히 삭제합니다.
  // (편집 중 자르기로 생긴 구간을 지우는 것과 달리, 빈 공간을 남기지 않고
  // 바로 사라지면서 뒤 클립이 앞으로 당겨집니다.)
  function deleteClipEntirely(id) {
    onChange(timeline.remove(id));
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
      pointerDragRef.current?.dispose();
    };
  }, []);

  // 돋보기 +/- 키로도 확대/축소할 수 있게 합니다(입력창에 포커스가 있을 때는
  // 무시). "+"는 Shift 없이 눌리는 키보드도 있어서 "=" 키도 함께 받습니다.
  useEffect(() => {
    function handleKeyDown(e) {
      if (FocusGuard.isTyping()) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoomLevel(TimelineZoom.in);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoomLevel(TimelineZoom.out);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
      if (FocusGuard.isTyping()) return;
      e.preventDefault();
      // 버튼에 포커스가 남아있으면(재생 버튼 등을 클릭한 직후) 브라우저가
      // 스페이스를 그 버튼 클릭으로도 한 번 더 해석해서 방금 토글한 재생 상태를
      // 되돌려버리는 경우가 있어, 포커스를 미리 없애서 "이중 토글"을 막습니다.
      const active = document.activeElement;
      if (active?.tagName === "BUTTON" && active instanceof HTMLElement) {
        active.blur();
      }
      togglePlayRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 자르기 모드에서 마우스(클릭 또는 호버) 위치가 지금 재생 헤드의 정확한
  // 위치에서 CUT_SNAP_PIXELS 이내인지 계산합니다. 이내라면 그 재생 헤드 지점의
  // fraction을 돌려주고(자석처럼 달라붙음), 아니라면 null. 클릭(실제 자르기)과
  // 호버(하이라이트 표시)가 똑같은 기준을 쓰도록 하나로 공유합니다.
  function computeSnapFraction(e, rect, seg, idx) {
    const segStart = timeline.startSecondsOf(idx, leadSeconds);
    const segDuration = seg.duration || 0;
    if (segDuration <= 0) return null;
    const playheadSeconds = (playheadPercent / 100) * displayTotalSeconds;
    if (playheadSeconds < segStart || playheadSeconds > segStart + segDuration) return null;
    const playheadFraction = (playheadSeconds - segStart) / segDuration;
    const playheadX = playheadFraction * rect.width;
    const clickX = e.clientX - rect.left;
    return Math.abs(clickX - playheadX) <= CUT_SNAP_PIXELS ? playheadFraction : null;
  }

  // 자르기 모드에서 마우스를 움직일 때마다 재생 헤드 근처인지 확인해서, 근처면
  // 재생 헤드 선이 붉게 도드라지도록(자석에 붙기 직전이라는 시각 피드백) 합니다.
  function handleSegmentMouseMove(e, seg, idx) {
    if (!cutMode || seg.type !== "clip") return;
    const rect = e.currentTarget.getBoundingClientRect();
    setSnapActive(computeSnapFraction(e, rect, seg, idx) !== null);
  }

  function handleSegmentMouseLeave() {
    setSnapActive(false);
  }

  function seekToPercent(percent) {
    setPlayheadPercent(percent);
    scrollPlayheadIntoView(percent, { force: true });
    if (isPlaying) {
      playFrom((percent / 100) * (previewBuffer?.duration || 0));
    }
  }

  // 클립을 클릭한 위치에 맞춰 재생 헤드(세로선)를 옮깁니다 — 재생 중이면
  // 그 위치부터 이어서 들리도록 실제로 탐색(seek)도 함께 합니다.
  function seekToSegment(e, seg, idx) {
    if (seg.type !== "clip" || timelineSeconds <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fractionWithinSeg = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const absoluteSeconds = timeline.startSecondsOf(idx, leadSeconds) + (seg.duration || 0) * fractionWithinSeg;
    seekToPercent(Math.max(0, Math.min(100, (absoluteSeconds / timelineSeconds) * 100)));
  }

  function handleRailClick(e) {
    if (!railRef.current || !previewBuffer) return;
    const rect = railRef.current.getBoundingClientRect();
    seekToPercent(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100);
  }

  function handleSegmentClick(e, seg, idx) {
    if (cutMode && seg.type === "clip") {
      const rect = e.currentTarget.getBoundingClientRect();
      // 마그네틱 스냅 — 호버 중 표시되던 것과 똑같은 기준으로, 재생 헤드 근처를
      // 클릭했으면 클릭한 픽셀 대신 재생 헤드의 정확한 위치로 달라붙듯 자릅니다.
      const fraction = computeSnapFraction(e, rect, seg, idx) ?? (e.clientX - rect.left) / rect.width;
      if (!Timeline.canSplitAt(seg, fraction)) return;
      splitSegment(seg.id, fraction);
      setCutMode(false);
      setSnapActive(false);
      return;
    }
    setSelectedId(seg.id === selectedId ? null : seg.id);
    seekToSegment(e, seg, idx);
  }

  function splitSegment(id, fraction) {
    const result = timeline.split(id, fraction);
    if (!result) return;
    onChange(result.segments);
    setSelectedId(result.leftId);
  }

  function deleteSelected() {
    if (!selected) return;
    onChange(timeline.deleteSegment(selected.id));
    setSelectedId(null);
  }

  // Delete / Backspace 키로도 선택된 구간을 지울 수 있게 합니다(맥 키보드의
  // "delete" 키는 실제로는 Backspace 이벤트를 보냅니다).
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
    onChange(timeline.joinAll());
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
    const next = timeline.move(dragId, targetId);
    if (!next) return;
    onChange(next);
    setDragId(null);
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

  // 배경음악 인트로 길이를 직관적으로 드래그해서 조정합니다 — 목소리 트랙 맨 앞의
  // 파란 핸들을 좌우로 끌면 "배경음악만 나오는 구간"이 늘거나 줄어듭니다.
  function handleOffsetDragStart(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = trackRowRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    setIsDraggingOffset(true);
    beginPointerDrag(
      {
        startX: e.clientX,
        startOffset: voiceOffsetSeconds,
        secondsPerPixel: timelineSeconds > 0 ? timelineSeconds / rect.width : 0,
      },
      {
        onMove: (ev, state) => {
          const next = state.startOffset + (ev.clientX - state.startX) * state.secondsPerPixel;
          const clamped = Math.max(MIN_VOICE_OFFSET, Math.min(MAX_VOICE_OFFSET, next));
          onVoiceOffsetChange(Math.round(clamped * 10) / 10);
        },
        onEnd: () => setIsDraggingOffset(false),
      }
    );
  }

  // 클립 중앙의 수직선을 위/아래로 드래그해서 그 클립만의 볼륨을 조절합니다.
  // 드래그 중에는 화면에만 미리 보여주고(gainDraft), 손을 뗄 때 한 번만
  // segments에 반영합니다 — 매 마우스 이동마다 실행취소 이력이 쌓이는 걸
  // 막기 위해서예요.
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
          onChange(timeline.setGain(state.id, state.currentGain));
          setGainDraft(null);
        },
      }
    );
  }

  // 배경음악 트랙 중앙의 수직선을 드래그해서 배경음악 전체 볼륨을 조절합니다
  // — 목소리 클립의 볼륨 슬라이더와 같은 방식/범위(ClipGain, 0~200%)입니다.
  // 되돌리기 이력에 영향을 주는 segments와 달리 배경음악 볼륨은 별도 상태라서,
  // 드래그 중에도 매 mousemove마다 바로 onBackgroundVolumeChange를 불러 실제
  // 값에 즉시 반영합니다(재생 중이면 아래 useEffect가 이어서 다시 재생합니다).
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

  // 배경음악 볼륨이 바뀌었는데 지금 재생 중이라면, 지금 위치에서 곧바로
  // 다시 시작해서(=previewBuffer가 이미 새 볼륨으로 다시 계산돼 있으므로)
  // 귀로 듣는 소리도 바로 바뀌도록 합니다. 아주 살짝 끊기는 느낌이 있을 수
  // 있지만, 드래그하면서 실시간으로 크기를 맞춰볼 수 있는 게 더 중요해서요.
  const firstBgVolumeRenderRef = useRef(true);
  useEffect(() => {
    if (firstBgVolumeRenderRef.current) {
      firstBgVolumeRenderRef.current = false;
      return;
    }
    if (!isPlaying) return;
    // 재생을 다시 시작하는 것(=상태 갱신)을 effect 본문에서 바로 동기적으로
    // 하지 않도록 한 틱 미뤄서 호출합니다.
    const offsetSeconds = (playheadPercent / 100) * (previewBuffer?.duration || 0);
    const timer = setTimeout(() => playFrom(offsetSeconds), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundVolume]);

  // 파형 확대(줌) 배율이 바뀌면 지금 재생 헤드가 있던 위치를 기준으로 화면
  // 가운데가 다시 맞춰지도록 가로 스크롤을 조정합니다. 이걸 안 하면 스크롤
  // 위치(픽셀)는 그대로인데 안쪽 내용만 넓어져서 엉뚱한 구간이 보이게 됩니다.
  useEffect(() => {
    scrollPlayheadIntoView(playheadPercent, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel]);

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
          {TimeFormat.duration(elapsedSeconds)} / {TimeFormat.duration(displayTotalSeconds)}
        </span>

        <button
          type="button"
          onClick={() => {
            setCutMode((v) => !v);
            setSnapActive(false);
          }}
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
          className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Magnet size={13} /> 자동으로 붙이기
        </button>

        {/* 파형 가로 확대 — 시간(오디오 길이)은 그대로 두고 파형이 그려지는
            폭만 넓혀서 아주 짧은 순간까지 세밀하게 자를 수 있게 합니다.
            넓어진 만큼은 좌우로 스크롤해서 보고, 키보드 +/- 로도 조절돼요. */}
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
          두 트랙 위로 재생 위치를 나타내는 세로선이 함께 지나갑니다. 확대(zoomLevel)
          하면 안쪽 내용의 "폭"이 넓어지고, 바깥쪽은 overflow-x-auto라서 넓어진 만큼
          좌우로 스크롤됩니다 — 오디오 길이 자체나 세로 높이는 바뀌지 않습니다. */}
      <div ref={zoomWrapperRef} className="relative mt-2 overflow-x-auto">
      <div className="relative" style={{ width: `${zoomLevel}%` }}>
      <div
        ref={trackRowRef}
        className="flex h-32 gap-0.5 overflow-hidden rounded-lg"
      >
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
            gainDraft?.id === seg.id ? gainDraft.gain : seg.gain ?? ClipGain.DEFAULT;
          const gainHandleTopPercent = ClipGain.handleTopPercent(effectiveGain);
          return (
            <div
              key={seg.id}
              draggable
              onDragStart={() => handleDragStart(seg.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropOn(seg.id)}
              onClick={(e) => handleSegmentClick(e, seg, idx)}
              onMouseMove={(e) => handleSegmentMouseMove(e, seg, idx)}
              onMouseLeave={handleSegmentMouseLeave}
              style={{ width: `${widthPercent}%`, ...(cutMode ? { cursor: SCISSORS_CURSOR } : {}) }}
              className={`group relative flex h-full min-w-[96px] cursor-pointer flex-col justify-end overflow-hidden rounded-md border-2 px-1 pb-1 transition ${
                isSelected ? "border-amber-700 bg-amber-50" : "border-stone-200 bg-stone-50 hover:border-stone-300"
              }`}
              title={Segment.label(seg, idx)}
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
                {TimeFormat.duration(seg.duration)}
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
          배경음악은 맨 앞부터 바로 나오므로 인트로 구간 없이 처음부터 채워집니다.
          중앙의 수직선을 드래그하면 배경음악 전체 볼륨이 조절됩니다(이게 유일한
          배경음악 볼륨 조절 방법이에요 — 목소리 클립 볼륨과 같은 방식입니다). */}
      {backgroundWaveform && backgroundWaveform.length > 0 && (() => {
        const effectiveBgVolume =
          bgVolumeDraft ?? ClipGain.clamp(backgroundVolume);
        const bgVolumeHandleTopPercent = ClipGain.handleTopPercent(effectiveBgVolume);
        return (
          <div className="mt-1 rounded-lg bg-sky-50 p-1.5">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-medium text-sky-600">
              <Music size={10} /> 배경음악{backgroundName ? `: ${backgroundName}` : ""} · 목소리는{" "}
              {voiceOffsetSeconds.toFixed(1)}초 후 시작 · 볼륨 {Math.round(effectiveBgVolume * 100)}%
            </p>
            <div className="relative flex h-16 items-end gap-[1px] overflow-hidden">
              {backgroundWaveform.map((v, i) => (
                <span key={i} className="w-full rounded-sm bg-sky-300" style={{ height: `${v}%` }} />
              ))}
              <div
                onMouseDown={handleBgVolumeDragStart}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-y-0 left-1/2 z-10 flex w-6 -translate-x-1/2 cursor-ns-resize items-start justify-center"
                title={`배경음악 볼륨 ${Math.round(effectiveBgVolume * 100)}% (드래그해서 조절)`}
              >
                <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-sky-500/60" />
                <div
                  className="pointer-events-none absolute left-1/2 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-sky-600 shadow"
                  style={{ top: `${bgVolumeHandleTopPercent}%` }}
                >
                  <GripHorizontal size={8} className="text-white" />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 목소리 + 배경음악 트랙을 함께 관통하는 재생 위치 세로선 — 자르기
          모드에서 마우스가 이 선 가까이 가면(자석처럼 달라붙기 직전) 붉고
          굵게 도드라져서, 그 상태로 클릭하면 정확히 이 위치에서 잘린다는
          걸 클릭하기 전부터 눈으로 알 수 있게 합니다. */}
      {timelineSeconds > 0 && (
        <div
          className={`pointer-events-none absolute inset-y-0 transition-all ${
            cutMode && snapActive
              ? "w-1 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]"
              : "w-0.5 bg-amber-700/70"
          }`}
          style={{ left: `${playheadPercent}%` }}
        />
      )}
      </div>
      </div>
    </div>
  );
}
