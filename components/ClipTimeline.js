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

// 파형 확대(가로 확대) — 오디오의 실제 길이는 그대로 두고, 파형이 그려지는
// 트랙의 "폭(가로)"을 넓혀서 짧은 순간까지 세밀하게 보고 자를 수 있게
// 합니다(영상 편집으로 치면 초 단위가 아니라 프레임 단위 컷을 할 수 있는
// 수준까지). 100%가 기본이자 최소값이고, 누를 때마다 두 배씩 커져서(가장
// 빠르게 세밀한 단계까지 도달하도록) 최대 3200%까지 확대되며, 넓어진
// 만큼은 좌우로 스크롤해서 봅니다.
const ZOOM_MIN = 100;
const ZOOM_MAX = 3200;

function zoomIn(level) {
  return Math.min(ZOOM_MAX, level * 2);
}
function zoomOut(level) {
  return Math.max(ZOOM_MIN, Math.round(level / 2));
}

// 자르기 모드에서 클릭(또는 마우스가 가까이 다가온) 지점이 재생 헤드(현재
// 위치선)에서 이 픽셀 이내면, 마치 자석처럼 그 정확한 위치로 달라붙습니다.
const CUT_SNAP_PIXELS = 14;

// 클립의 맨 앞/뒤 끝에서 이 시간(초) 이내로는 자르지 않습니다(너무 얇은
// 조각이 생기는 걸 막기 위한 최소한의 여유). 예전에는 이걸 클립 길이의
// 4%로 계산했는데, 클립이 몇 분씩 길어지면 가장자리 4%가 수십 초에 달해서
// — 특히 재생 헤드가 클립 끝부분 근처일 때 — 자석 스냅이 빨갛게 표시돼도
// 정작 클릭하면 조용히 잘리지 않는 버그가 있었습니다. 절대 시간 기준으로
// 아주 짧게(프레임 단위) 잡아서 이 문제를 없앴습니다.
const MIN_SPLIT_SECONDS = 0.05;

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
  const [bgVolumeDraft, setBgVolumeDraft] = useState(null); // 드래그 중 미리보기 값 (0~MAX_CLIP_GAIN)
  const [zoomLevel, setZoomLevel] = useState(ZOOM_MIN); // 100~3200(%) — 가로 확대 배율
  const [snapActive, setSnapActive] = useState(false); // 자르기 모드에서 재생 헤드에 자석처럼 붙었는지
  const railRef = useRef(null);
  const trackRowRef = useRef(null);
  const zoomWrapperRef = useRef(null);
  const sourceRef = useRef(null);
  const startedAtRef = useRef(0);
  const rafRef = useRef(null);
  const firstRenderRef = useRef(true);
  const offsetDragStateRef = useRef(null);
  const gainDragStateRef = useRef(null);
  const bgVolumeDragStateRef = useRef(null);

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

  // 확대된 타임라인 안에서 재생 헤드가 화면 가장자리에 가까워지면 스크롤이
  // 따라가게 합니다. 이걸 React useEffect(의존성: playheadPercent)로 만들면
  // 재생 중 1초에 60번씩 상태가 바뀔 때마다 매번 별도의 effect 커밋을
  // 거치게 되는데, 그 과정에서 실제로는 헤더가 멈춘 것처럼 보이다가
  // 정지했을 때 한꺼번에 따라잡는 문제가 있었습니다. 그래서 effect로
  // 반응하는 대신, 재생 애니메이션 루프(tick)와 각 seek 지점에서 이
  // 함수를 직접 호출하는 방식으로 바꿨습니다.
  function scrollPlayheadIntoView(pct, { force = false } = {}) {
    const wrapper = zoomWrapperRef.current;
    if (!wrapper) return;
    const scrollWidth = wrapper.scrollWidth;
    const clientWidth = wrapper.clientWidth;
    if (scrollWidth <= clientWidth) return;
    const playheadPx = (pct / 100) * scrollWidth;
    if (force) {
      wrapper.scrollLeft = Math.max(0, Math.min(scrollWidth - clientWidth, playheadPx - clientWidth / 2));
      return;
    }
    const viewStart = wrapper.scrollLeft;
    const viewEnd = viewStart + clientWidth;
    const margin = clientWidth * 0.15;
    if (playheadPx < viewStart + margin || playheadPx > viewEnd - margin) {
      wrapper.scrollLeft = Math.max(0, Math.min(scrollWidth - clientWidth, playheadPx - clientWidth / 2));
    }
  }

  function tick() {
    const ctx = getAudioContext();
    if (!sourceRef.current || !previewBuffer) return;
    const elapsed = ctx.currentTime - startedAtRef.current;
    const pct = Math.min(100, (elapsed / previewBuffer.duration) * 100);
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
      if (bgVolumeDragStateRef.current) {
        window.removeEventListener("mousemove", handleBgVolumeDragMove);
        window.removeEventListener("mouseup", handleBgVolumeDragEnd);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 돋보기 +/- 키로도 확대/축소할 수 있게 합니다(입력창에 포커스가 있을 때는
  // 무시). "+"는 Shift 없이 눌리는 키보드도 있어서 "=" 키도 함께 받습니다.
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoomLevel(zoomIn);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoomLevel(zoomOut);
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

  // idx번째 구간이 시작되는 절대 시간(초) — 배경음악 인트로가 있으면 그만큼
  // 뒤에서 시작합니다. seekToSegment와 자르기의 마그네틱 스냅이 함께 씁니다.
  function cumulativeSecondsBefore(idx) {
    let cumulative = hasBackground ? voiceOffsetSeconds : 0;
    for (let i = 0; i < idx; i++) {
      cumulative += segments[i].duration || 0;
    }
    return cumulative;
  }

  // 자르기 모드에서 마우스(클릭 또는 호버) 위치가 지금 재생 헤드의 정확한
  // 위치에서 CUT_SNAP_PIXELS 이내인지 계산합니다. 이내라면 그 정확한
  // 재생 헤드 지점의 fraction을 돌려주고(자석처럼 달라붙음), 아니라면
  // null을 돌려줍니다. 클릭(실제 자르기)과 호버(하이라이트 표시)가 똑같은
  // 기준을 쓰도록 하나로 공유합니다.
  function computeSnapFraction(e, rect, seg, idx) {
    const segStart = cumulativeSecondsBefore(idx);
    const segDuration = seg.duration || 0;
    if (segDuration <= 0) return null;
    const playheadSeconds = (playheadPercent / 100) * displayTotalSeconds;
    if (playheadSeconds < segStart || playheadSeconds > segStart + segDuration) return null;
    const playheadFraction = (playheadSeconds - segStart) / segDuration;
    const playheadX = playheadFraction * rect.width;
    const clickX = e.clientX - rect.left;
    if (Math.abs(clickX - playheadX) <= CUT_SNAP_PIXELS) {
      return playheadFraction;
    }
    return null;
  }

  // 자르기 모드에서 마우스를 움직일 때마다 재생 헤드 근처인지 확인해서,
  // 근처면 재생 헤드 선이 붉게 도드라지도록(자석에 붙기 직전이라는 시각
  // 피드백) 합니다 — 클릭하기 전부터 "달라붙는 느낌"이 보여야 실제로
  // 체감이 되기 때문에, 클릭 시점에만 조용히 계산하던 것에서 바꿨습니다.
  function handleSegmentMouseMove(e, seg, idx) {
    if (!cutMode || seg.type !== "clip") return;
    const rect = e.currentTarget.getBoundingClientRect();
    setSnapActive(computeSnapFraction(e, rect, seg, idx) !== null);
  }

  function handleSegmentMouseLeave() {
    setSnapActive(false);
  }

  // 클립을 클릭한 위치에 맞춰 재생 헤드(세로선)를 옮깁니다 — 재생 중이면
  // 그 위치부터 이어서 들리도록 실제로 탐색(seek)도 함께 합니다.
  function seekToSegment(e, seg, idx) {
    if (seg.type !== "clip" || timelineSeconds <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fractionWithinSeg = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const cumulative = cumulativeSecondsBefore(idx);
    const absoluteSeconds = cumulative + (seg.duration || 0) * fractionWithinSeg;
    const percent = Math.max(0, Math.min(100, (absoluteSeconds / timelineSeconds) * 100));
    setPlayheadPercent(percent);
    scrollPlayheadIntoView(percent, { force: true });
    if (isPlaying) {
      playFrom((percent / 100) * (previewBuffer?.duration || 0));
    }
  }

  function seekTo(clientX) {
    if (!railRef.current || !previewBuffer) return;
    const rect = railRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const percent = fraction * 100;
    setPlayheadPercent(percent);
    scrollPlayheadIntoView(percent, { force: true });
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
      let fraction = (e.clientX - rect.left) / rect.width;

      // 마그네틱 스냅 — 호버 중 표시되던 것과 똑같은 기준으로, 재생 헤드
      // 근처를 클릭했으면 클릭한 정확한 픽셀 대신 재생 헤드의 정확한
      // 위치로 달라붙듯 자릅니다.
      const snapped = computeSnapFraction(e, rect, seg, idx);
      if (snapped !== null) fraction = snapped;

      // 아주 얇은 조각이 생기는 것만 막습니다(절대 시간 기준) — 자석
      // 스냅으로 빨갛게 표시된 지점은 클립 길이와 무관하게 거의 항상
      // 잘릴 수 있어야 합니다.
      const minFraction = seg.duration > 0 ? Math.min(0.45, MIN_SPLIT_SECONDS / seg.duration) : 0.04;
      if (fraction < minFraction || fraction > 1 - minFraction) return;
      splitSegment(seg.id, fraction);
      setCutMode(false);
      setSnapActive(false);
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

  // 배경음악 트랙 중앙의 수직선을 드래그해서 배경음악 전체 볼륨을 조절합니다
  // — 목소리 클립의 볼륨 슬라이더와 완전히 똑같은 방식입니다: 범위도
  // 0~MAX_CLIP_GAIN(0~200%)으로 같고, 기본값 1(=100%, 원본 그대로)이 정확히
  // 클립 가운데에 오며, 위로 올리면 커지고 아래로 내리면 작아집니다.
  // 되돌리기 이력에 영향을 주는 segments와 달리 배경음악 볼륨은 별도
  // 상태라서, 드래그 중에도 매 mousemove마다 바로 onBackgroundVolumeChange를
  // 불러 실제 값에 즉시 반영합니다(재생 중이면 아래 useEffect가 바로
  // 이어서 다시 재생해 소리에도 바로 반영되게 합니다).
  function handleBgVolumeDragStart(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const initialVolume = Math.max(MIN_CLIP_GAIN, Math.min(MAX_CLIP_GAIN, backgroundVolume));
    bgVolumeDragStateRef.current = {
      rectTop: rect.top,
      rectHeight: rect.height || 1,
      currentVolume: initialVolume,
    };
    setBgVolumeDraft(initialVolume);
    window.addEventListener("mousemove", handleBgVolumeDragMove);
    window.addEventListener("mouseup", handleBgVolumeDragEnd);
  }

  function handleBgVolumeDragMove(e) {
    const state = bgVolumeDragStateRef.current;
    if (!state) return;
    const fraction = 1 - Math.max(0, Math.min(1, (e.clientY - state.rectTop) / state.rectHeight));
    const volume = Math.max(MIN_CLIP_GAIN, Math.min(MAX_CLIP_GAIN, Math.round(fraction * MAX_CLIP_GAIN * 100) / 100));
    state.currentVolume = volume;
    setBgVolumeDraft(volume);
    onBackgroundVolumeChange(volume);
  }

  function handleBgVolumeDragEnd() {
    bgVolumeDragStateRef.current = null;
    window.removeEventListener("mousemove", handleBgVolumeDragMove);
    window.removeEventListener("mouseup", handleBgVolumeDragEnd);
    setBgVolumeDraft(null);
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
    // previewBuffer는 이 effect가 실행되는 시점에 이미 새 backgroundVolume으로
    // 다시 계산되어 있지만, 재생을 다시 시작하는 것(=상태 갱신)을 effect 본문에서
    // 바로 동기적으로 하지 않도록 한 틱 미뤄서 호출합니다.
    const offsetSeconds = (playheadPercent / 100) * (previewBuffer?.duration || 0);
    const timer = setTimeout(() => playFrom(offsetSeconds), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundVolume]);

  // 파형 확대(줌) 배율이 바뀌면(버튼/키보드) 지금 재생 헤드가 있던 위치를
  // 기준으로 화면 가운데가 다시 맞춰지도록 가로 스크롤을 조정합니다. 이걸
  // 안 하면 확대할 때마다 스크롤 위치(픽셀)는 그대로인데 안쪽 내용만
  // 넓어져서, 화면에는 전혀 엉뚱한(대개 맨 앞) 구간이 보이게 됩니다 —
  // "확대는 됐는데 실제 보고/클릭하는 위치가 의도한 곳이 아니다"라고
  // 느껴졌던 원인입니다.
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
          {formatDuration(elapsedSeconds)} / {formatDuration(displayTotalSeconds)}
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
            onClick={() => setZoomLevel(zoomOut)}
            disabled={zoomLevel <= ZOOM_MIN}
            className="flex h-6 w-6 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="파형 축소"
            title="파형 축소 (키보드 -)"
          >
            <ZoomOut size={13} />
          </button>
          <span className="w-11 text-center text-[11px] tabular-nums text-stone-400">{zoomLevel}%</span>
          <button
            type="button"
            onClick={() => setZoomLevel(zoomIn)}
            disabled={zoomLevel >= ZOOM_MAX}
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
              onMouseMove={(e) => handleSegmentMouseMove(e, seg, idx)}
              onMouseLeave={handleSegmentMouseLeave}
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
          배경음악은 맨 앞부터 바로 나오므로 인트로 구간 없이 처음부터 채워집니다.
          중앙의 수직선을 드래그하면 배경음악 전체 볼륨이 조절됩니다(이게 유일한
          배경음악 볼륨 조절 방법이에요 — 목소리 클립 볼륨과 같은 방식입니다). */}
      {backgroundWaveform && backgroundWaveform.length > 0 && (() => {
        const effectiveBgVolume =
          bgVolumeDraft ?? Math.max(MIN_CLIP_GAIN, Math.min(MAX_CLIP_GAIN, backgroundVolume));
        const bgVolumeHandleTopPercent = (1 - Math.min(1, effectiveBgVolume / MAX_CLIP_GAIN)) * 100;
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
