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
import LevelMeterView from "@/components/studio/LevelMeterView";
import MusicTrackLane from "@/components/studio/MusicTrackLane";
import WaveformCanvas from "@/components/studio/WaveformCanvas";
import { BackgroundMixer, ClipGain, TimeFormat, WaveformAnalyzer } from "@/lib/audio";
import { MusicClip } from "@/lib/audioProject";
import { FileDrop, FileKind } from "@/lib/fileDrop";
import {
  ClipRoll,
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

// 선택(기본): 클립 가장자리를 끌면 리플 트리밍 · 자르기 · 롤링: 두 클립 사이 경계를 옮김(전체 길이 그대로)
const MODE = Object.freeze({ SELECT: "select", CUT: "cut", ROLL: "roll" });

// 클립 가장자리를 잡을 수 있는 폭(px)
const EDGE_PX = 8;

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
  musicClip = null, // { startSeconds, offsetSeconds, endSeconds|null } — 배경음악 클립(MusicClip)
  onMusicClipChange = () => {},
  onRemoveBackground = null, // () => void — 배경음악 트랙에서 배경음악 빼기
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
  // 가장자리를 끄는 동안 화면에만 보여 줄 값 — 손을 떼면 한 번에 반영(실행 취소 1칸).
  const [edgeDraft, setEdgeDraft] = useState(null); // { ranges: { [clipId]: { inSample, outSample } }, label }
  const [musicDraft, setMusicDraft] = useState(null); // 배경음악 클립 { startSeconds, offsetSeconds, endSeconds, pieces }
  const [musicSelectedId, setMusicSelectedId] = useState(null); // 고른 배경음악 조각(목소리 클립을 고르면 풀림)
  const [frozenAxis, setFrozenAxis] = useState(null); // 끄는 동안 화면 배율 고정(초)
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
  // 데시벨 미터가 매 프레임 읽을 측정기(재생기와 같은 것). 렌더마다 바뀌지 않게 한 번만 만듭니다.
  const [getMeter] = useState(() => () => {
    if (!playerRef.current) playerRef.current = new PreviewPlayer();
    return playerRef.current.meter;
  });

  // 편집은 항상 실제 segments로, 화면 배치는 가장자리를 끄는 중이면 그 길이를 반영한 것으로.
  const editTimeline = new Timeline(segments);
  const shownSegments = edgeDraft
    ? segments.map((s) => {
        const r = edgeDraft.ranges[s.id];
        return r ? Segment.preview(s, r.inSample, r.outSample) : s;
      })
    : segments;
  const timeline = new Timeline(shownSegments);
  const voiceSeconds = timeline.totalSeconds;
  const hasGap = editTimeline.hasGap;
  const selected = editTimeline.find(selectedId);

  const hasBackground = Boolean(backgroundBuffer);
  const leadSeconds = hasBackground ? voiceOffsetSeconds : 0;
  const shownMusic = musicDraft || musicClip || {};
  // 실제 믹싱과 같은 믹서 — 전체 길이, 배경음악 클립 위치, 시간별 볼륨(파형)이 모두 여기서 나옵니다.
  const backgroundMixer = BackgroundMixer.fromSettings({
    musicVolume: backgroundVolume,
    voiceOffsetSeconds,
    musicClip: shownMusic,
  });
  const musicStart = backgroundMixer.musicStartSeconds;
  const musicEnd = backgroundMixer.endSeconds(voiceSeconds);
  const isMusicArranged = Boolean(shownMusic.pieces?.length);
  // 배경음악 트랙에 보일 조각들 — 편집했으면 그 배치, 아니면 자동(곡이 짧으면 반복된 곳마다 조각).
  const musicArrangement = backgroundBuffer ? backgroundMixer.arrangementFor(voiceSeconds, backgroundBuffer.duration) : null;
  const activeMusicId = selectedId ? null : musicSelectedId;
  const naturalSeconds = hasBackground ? backgroundMixer.totalSeconds(voiceSeconds) : voiceSeconds;
  // 가장자리를 끄는 동안에는 화면 배율을 고정해서(전체 길이가 바뀌어도) 끄는 손과 가장자리가 어긋나지 않게 합니다.
  const axis = new TimeAxis(frozenAxis ?? naturalSeconds);

  // 실제로 재생되는 소리 — 디코딩한 클립 + 빈 공간의 진짜 무음, 배경음악이 있으면 저장과 같은 믹스.
  const musicKey = JSON.stringify(musicClip || {});
  const previewBuffer = useMemo(() => {
    const voice = new Timeline(segments).toBuffer();
    if (!voice) return null;
    if (!backgroundBuffer) return voice;
    return BackgroundMixer.fromSettings({ musicVolume: backgroundVolume, voiceOffsetSeconds, musicClip: JSON.parse(musicKey) }).mix(
      voice,
      backgroundBuffer
    );
  }, [segments, backgroundBuffer, backgroundVolume, voiceOffsetSeconds, musicKey]);

  // 배경음악 곡 한 바퀴의 음량 막대(1초에 8개) — 배경음악 클립 상자에 곡 위치대로 골라 그립니다.
  const songPeaks = useMemo(
    () =>
      backgroundBuffer
        ? WaveformAnalyzer.peaks(backgroundBuffer, Math.max(16, Math.min(4000, Math.round(backgroundBuffer.duration * 8))))
        : null,
    [backgroundBuffer]
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
  }, [segments, backgroundBuffer, voiceOffsetSeconds, musicKey]);

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
    if (axis.seconds <= 0 || edgeDraft || musicDraft) return;
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
    setMusicSelectedId(null);
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

  /** 가장자리 끌기 공통 준비 — 재생을 멈추고 화면 배율을 고정한 뒤, 초 단위 이동량으로 onMove를 부릅니다. */
  function beginEdgeDrag(e, { onMove, onEnd }) {
    e.preventDefault();
    e.stopPropagation();
    const pps = axis.pixelsPerSecond(trackRowRef.current?.getBoundingClientRect());
    if (!pps) return;
    stopPlayback();
    setIsPlaying(false);
    setFrozenAxis(axis.seconds);
    beginPointerDrag(
      { startX: e.clientX, pps, cursor: "ew-resize" },
      {
        onMove: (ev, state) => onMove((ev.clientX - state.startX) / state.pps, state),
        onEnd: (ev, state) => {
          setFrozenAxis(null);
          onEnd(state);
        },
      }
    );
  }

  // 리플 트리밍 — 클립 가장자리(data-seg-id, data-edge)를 좌우로 끕니다. 오른쪽 끝을 오른쪽으로 당기면
  // 숨어 있던 뒷부분이 나타나고, 왼쪽으로 밀면 줄어듭니다. 앞 끝도 같은 방식. 뒤 클립들은 따라 움직입니다.
  function handleClipEdgeStart(e) {
    const { segId, edge } = e.currentTarget.dataset;
    const seg = editTimeline.find(segId);
    if (!seg || seg.type !== "clip") return;
    beginEdgeDrag(e, {
      onMove: (delta, state) => {
        // 앞 끝은 오른쪽으로 끌면 줄어드는 방향이라, 화면 움직임과 같은 쪽으로 보이게 그대로 씁니다.
        const range = ClipTrim.range(seg, edge, delta);
        state.range = range;
        setEdgeDraft({ ranges: { [seg.id]: range } });
      },
      onEnd: (state) => {
        setEdgeDraft(null);
        const r = state.range;
        if (r && (r.inSample !== seg.inSample || r.outSample !== seg.outSample)) {
          onChange(editTimeline.trim(seg.id, r.inSample, r.outSample));
          setSelectedId(seg.id);
        }
      },
    });
  }

  // 롤링 — 붙어 있는 두 클립 사이 경계(data-left-id, data-right-id)를 끕니다. 앞 클립이 늘면 뒤 클립이
  // 그만큼 줄어서 전체 길이와 뒤쪽 위치는 그대로입니다.
  function handleRollStart(e) {
    const { leftId, rightId } = e.currentTarget.dataset;
    const left = editTimeline.find(leftId);
    const right = editTimeline.find(rightId);
    if (!left || !right) return;
    beginEdgeDrag(e, {
      onMove: (delta, state) => {
        const r = ClipRoll.range(left, right, delta);
        state.roll = r;
        setEdgeDraft({
          ranges: {
            [left.id]: { inSample: left.inSample, outSample: r.leftOut },
            [right.id]: { inSample: r.rightIn, outSample: right.outSample },
          },
        });
      },
      onEnd: (state) => {
        setEdgeDraft(null);
        const r = state.roll;
        if (r && r.deltaSeconds !== 0) onChange(editTimeline.roll(left.id, right.id, r.leftOut, r.rightIn));
      },
    });
  }

  // 배경음악 클립 가장자리 — 앞 끝을 끌면 음악이 시작하는 곳과 곡 안 시작 위치가 함께 움직이고(앞부분 트리밍),
  // 뒤 끝을 끌면 음악이 끝나는 곳이 바뀝니다(곡보다 길게 당기면 반복해서 이어지고, 끝에서 4초 페이드아웃).
  function handleMusicEdgeStart(e) {
    const edge = e.currentTarget.dataset.edge;
    const song = backgroundBuffer?.duration || 0;
    const base = { startSeconds: musicStart, offsetSeconds: backgroundMixer.musicOffsetSeconds, endSeconds: musicEnd };
    const autoEnd = musicClip?.endSeconds === null || musicClip?.endSeconds === undefined;
    const maxEnd = leadSeconds + voiceSeconds + 600;
    beginEdgeDrag(e, {
      onMove: (delta, state) => {
        let next;
        if (edge === "start") {
          const start = Math.max(0, Math.min(base.endSeconds - BackgroundMixer.MIN_MUSIC_SECONDS, base.startSeconds + delta));
          const moved = start - base.startSeconds;
          const offset = song ? (((base.offsetSeconds + moved) % song) + song) % song : 0;
          next = { startSeconds: start, offsetSeconds: offset, endSeconds: autoEnd ? null : base.endSeconds };
        } else {
          const end = Math.max(base.startSeconds + BackgroundMixer.MIN_MUSIC_SECONDS, Math.min(maxEnd, base.endSeconds + delta));
          next = { startSeconds: base.startSeconds, offsetSeconds: base.offsetSeconds, endSeconds: end };
        }
        state.music = next;
        setMusicDraft(next);
      },
      onEnd: (state) => {
        setMusicDraft(null);
        if (state.music) onMusicClipChange(musicClip?.with ? musicClip.with(state.music) : state.music);
      },
    });
  }

  /** 배경음악 조각 편집(복사·붙이기·자르기·삭제·디졸브) 결과를 반영합니다. 자동 배치였다면 이때 조각으로 바뀝니다. */
  function commitMusicArrangement(arrangement) {
    onMusicClipChange(MusicClip.fromArrangement(arrangement));
  }

  function selectMusicPiece(id, seconds) {
    setMusicSelectedId(id);
    if (id) setSelectedId(null);
    if (Number.isFinite(seconds)) seekTo(seconds);
  }

  // 편집한 배경음악 조각의 가장자리 — 앞 끝은 앞부분을, 뒤 끝은 뒷부분을 잘라 내거나 되살립니다(곡 길이 안에서).
  function handleMusicPieceEdgeStart(e, pieceId, edge) {
    const base = musicArrangement;
    const song = backgroundBuffer?.duration || 0;
    if (!base) return;
    beginEdgeDrag(e, {
      onMove: (delta, state) => {
        state.music = MusicClip.fromArrangement(base.trim(pieceId, edge, delta, song));
        setMusicDraft(state.music);
      },
      onEnd: (state) => {
        setMusicDraft(null);
        if (state.music) onMusicClipChange(state.music);
      },
    });
  }

  /** 편집한 배경음악을 처음의 자동 배치(곡이 짧으면 자동 반복, 끝은 자동)로 되돌립니다. */
  function resetMusicArrangement() {
    onMusicClipChange(new MusicClip({ startSeconds: musicStart }));
    setMusicSelectedId(null);
  }

  /** 배경음악 끝을 다시 "자동"(마지막 목소리 끝 + 페이드아웃)으로. */
  function resetMusicEnd() {
    if (musicClip?.with) onMusicClipChange(musicClip.with({ endSeconds: null }));
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
  const isRoll = mode === MODE.ROLL;
  const isSelectMode = mode === MODE.SELECT;

  const modeHint = isCut
    ? "빨간 표시선이 있는 곳을 누르면 정확히 그 자리에서 잘려요. 재생선 가까이 가면 재생선에 붙어요. (Esc: 그만)"
    : isRoll
    ? "붙어 있는 두 클립 사이의 노란 경계를 좌우로 끌면, 한쪽이 늘어난 만큼 다른 쪽이 줄어요. 전체 길이는 그대로예요. (Esc: 그만)"
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
          onClick={() => toggleMode(MODE.ROLL)}
          disabled={editTimeline.clips.length < 2}
          aria-pressed={isRoll}
          title="두 클립 사이 경계를 옮기기(롤링)"
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
            isRoll ? "border-amber-400 bg-amber-50 text-amber-800" : "border-stone-300 text-stone-600 hover:bg-stone-100"
          }`}
        >
          <UnfoldHorizontal size={13} /> 롤링
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

      <p className={`mt-2 text-xs ${isCut ? "text-red-600" : isRoll ? "text-amber-700" : "text-stone-400"}`}>
        {modeHint ||
          "클립이나 배경음악의 가장자리를 잡고 좌우로 끌면 길이를 바꿀 수 있어요(오른쪽으로 당기면 숨은 부분이 나타나요). 클립 가운데를 끌면 순서를 바꿔요."}
      </p>

      {/* 진행바 + 목소리 줄 + 배경음악 줄 — 모두 같은 시간축. 진행바도 확대 영역 안에 있어서 확대하면
          함께 넓어지고 함께 스크롤되므로, 진행바의 위치와 파형 위 세로선이 언제나 같은 자리에 있습니다. */}
      {/* 오른쪽에는 데시벨 미터(L/R) — 미리듣기 소리의 크기. */}
      <div className="mt-4 flex items-stretch gap-2">
      <div ref={zoomWrapperRef} className="relative min-w-0 flex-1 overflow-x-auto">
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
              const isTrimming = Boolean(edgeDraft?.ranges[seg.id]);
              const hidden = Segment.hiddenEdges(seg);
              const canReorder = isSelectMode && !edgeDraft;
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
                  {isSelectMode && (
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

                  {/* 리플 트리밍 손잡이 — 양쪽 가장자리(선택 모드에서 언제나). 마우스를 올리면 ↔, 잘려서 숨은 부분이
                      있는 쪽은 진하게 보여서 "더 당기면 나타난다"는 걸 알 수 있어요. */}
                  {isSelectMode &&
                    [ClipTrim.EDGES.START, ClipTrim.EDGES.END].map((edge) => {
                      const isStart = edge === ClipTrim.EDGES.START;
                      const strong = isStart ? hidden.start : hidden.end;
                      return (
                        <div
                          key={edge}
                          data-seg-id={seg.id}
                          data-edge={edge}
                          draggable={false}
                          onDragStart={(e) => e.preventDefault()}
                          onMouseDown={handleClipEdgeStart}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: EDGE_PX }}
                          className={`group/edge absolute inset-y-0 z-20 cursor-ew-resize ${isStart ? "left-0" : "right-0"}`}
                          title={isStart ? "앞부분 길이 — 좌우로 끌기" : "뒷부분 길이 — 좌우로 끌기(오른쪽으로 당기면 숨은 부분이 나타나요)"}
                          aria-label={isStart ? "앞부분 트리밍" : "뒷부분 트리밍"}
                        >
                          <span
                            className={`absolute inset-y-0 w-1 transition group-hover/edge:w-1.5 ${isStart ? "left-0 rounded-l-md" : "right-0 rounded-r-md"} ${
                              isTrimming ? "bg-amber-500" : strong ? "bg-amber-400/80 group-hover/edge:bg-amber-500" : "bg-transparent group-hover/edge:bg-amber-400"
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

            {hasBackground && voiceSeconds > 0 && musicEnd > leadSeconds + voiceSeconds && (
              <div
                style={{
                  left: `${axis.percentOf(leadSeconds + voiceSeconds)}%`,
                  width: `${axis.percentOf(musicEnd - leadSeconds - voiceSeconds)}%`,
                }}
                className="pointer-events-none absolute inset-y-0 flex items-center justify-center rounded-md border-2 border-dashed border-sky-100 text-center text-[10px] leading-tight text-sky-400"
                title="목소리가 끝난 뒤 배경음악만 이어지다 서서히 작아지는 구간"
              >
                {axis.percentOf(musicEnd - leadSeconds - voiceSeconds) > 6 && "배경음악만"}
              </div>
            )}

            {/* 롤링 손잡이 — 붙어 있는 두 클립 사이 경계마다. */}
            {isRoll &&
              shownSegments.map((seg, idx) => {
                const pair = timeline.neighborsAt(idx);
                if (!pair) return null;
                const boundary = timeline.startSecondsOf(idx + 1, leadSeconds);
                return (
                  <div
                    key={`roll-${seg.id}`}
                    data-left-id={pair.left.id}
                    data-right-id={pair.right.id}
                    onMouseDown={handleRollStart}
                    onClick={(e) => e.stopPropagation()}
                    style={{ left: `${axis.percentOf(boundary)}%`, width: EDGE_PX * 2 }}
                    className="group/roll absolute inset-y-0 z-30 -translate-x-1/2 cursor-ew-resize"
                    title="경계 옮기기(롤링) — 좌우로 끌기"
                    aria-label="두 클립 사이 경계 옮기기"
                  >
                    <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded bg-amber-400 group-hover/roll:w-1.5 group-hover/roll:bg-amber-500" />
                    <span className="absolute left-1/2 top-1/2 h-5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white bg-amber-500 shadow" />
                  </div>
                );
              })}

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

          {/* 배경음악 트랙 — 오디오 트랙과 같은 시간축. 곡을 올리면 조각(클립)으로 보이고, 조각을 골라
              복사·붙이기·자르기·삭제·디졸브, 가장자리 끌기로 다듬습니다(components/studio/MusicTrackLane.js). */}
          {(() => {
            const effectiveBgVolume = bgVolumeDraft ?? ClipGain.clamp(backgroundVolume);
            const hasClip = Boolean(hasBackground && songPeaks && hasAnything && musicArrangement);
            const isCustomEnd = musicClip?.endSeconds !== null && musicClip?.endSeconds !== undefined;
            if (hasClip) {
              return (
                <MusicTrackLane
                  axis={axis}
                  arrangement={musicArrangement}
                  isArranged={isMusicArranged}
                  mixer={backgroundMixer}
                  voiceSeconds={voiceSeconds}
                  songPeaks={songPeaks}
                  songSeconds={backgroundBuffer.duration}
                  volume={effectiveBgVolume}
                  isVolumeDragging={bgVolumeDraft !== null}
                  isDragging={Boolean(musicDraft)}
                  backgroundName={backgroundName}
                  playheadSeconds={playheadSeconds}
                  selectedId={activeMusicId}
                  onSelect={selectMusicPiece}
                  onChange={commitMusicArrangement}
                  onPieceEdgeStart={handleMusicPieceEdgeStart}
                  onRemoveMusic={
                    onRemoveBackground &&
                    (() => {
                      setMusicSelectedId(null);
                      onRemoveBackground();
                    })
                  }
                  onAutoEdgeStart={handleMusicEdgeStart}
                  onVolumeDragStart={handleBgVolumeDragStart}
                  onVolumeChange={onBackgroundVolumeChange}
                  resetLabel={isMusicArranged ? "자동 배치로" : isCustomEnd ? "끝 자동 맞춤" : ""}
                  resetTitle={
                    isMusicArranged
                      ? "편집한 조각을 모두 지우고 처음처럼 자동(곡이 짧으면 반복, 끝은 목소리에 맞춤)으로 되돌려요"
                      : "배경음악 끝을 마지막 오디오 끝 + 페이드아웃으로 되돌려요"
                  }
                  onReset={isMusicArranged ? resetMusicArrangement : resetMusicEnd}
                  VolumeBadge={VolumeBadge}
                />
              );
            }
            return (
              <div className="mt-1 rounded-lg border border-dashed border-sky-200 bg-sky-50/40 p-1.5">
                <div className="mb-1 h-4">
                  <span className="sticky left-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700">
                    <Music size={11} /> 배경음악 트랙
                  </span>
                </div>
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
        <LevelMeterView getMeter={getMeter} active={isPlaying} />
      </div>
    </div>
  );
}
