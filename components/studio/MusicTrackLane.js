"use client";

// 배경음악 트랙 한 줄(편집 타임라인 안) — 배경음악을 조각(클립)으로 보여 주고 편집합니다.
//   · 조각을 누르면 고르기(노란 테두리), 재생선도 그 자리로
//   · [복사] 고른 조각을 기억 · [붙이기] 고른 조각 바로 뒤(없으면 맨 뒤)에 끼워 넣기 — 곡이 짧을 때 이어 붙이기
//   · [자르기] 재생선 자리에서 조각을 둘로 · [삭제] 고른 조각 빼기(뒤 조각이 당겨짐)
//   · [디졸브] 고른 조각과 앞 조각을 1초 15프레임(1.5초) 겹쳐 부드럽게 넘기기
//     디졸브는 두 조각 사이에 회색 상자(⧓)로 보입니다 — 누르면 고르기, Delete로 지우기,
//     양 끝 손잡이(‖)를 끌면 프레임 단위로 늘이고 줄이기.
//   · 트리밍 — 두 조각 사이(경계·디졸브 상자 가운데)를 끌면 경계만 옮겨지고 두 조각을 합친 시간은 그대로(마우스 ][).
//   · 롤링 — 조각의 앞·뒤 끝을 끌면 그 조각 길이만 바뀌고 뒤 조각들이 따라 움직임(마우스 [◀ / ▶]).
//   · 트리밍 도구(T) — 켜고 조각 안을 끌면 조각 자리·길이는 그대로, 안에서 들리는 곡 위치만 옮김(마우스 [◀▶]).
//   · 조각 가장자리 끌기 — 앞·뒤를 잘라 내거나 되살리기(곡 길이 안에서)
// 키보드: ⌘/Ctrl+C 복사, ⌘/Ctrl+V 붙이기, B 재생선에서 자르기, T 트리밍 도구 켜기/끄기,
//         Delete 삭제(배경음악 조각이나 디졸브를 골랐을 때만).
// 계산은 lib/musicArrangement.js, 실제 소리는 BackgroundMixer가 같은 배치로 섞습니다.

import { memo, useEffect, useRef, useState } from "react";
import { ClipboardCopy, ClipboardPaste, GripHorizontal, Music, MoveHorizontal, Scissors, Trash2 } from "lucide-react";
import { ClipGain, TimeFormat } from "@/lib/audio";
import { MusicArrangement } from "@/lib/musicArrangement";
import { FocusGuard } from "@/lib/timeline";
import { EditCursor } from "@/lib/editCursors";

const EDGE_PX = 14; // 조각 끝 롤링 잡는 폭
const TRIM_PX = 8; // 두 조각 사이 트리밍 잡는 폭(경계 가운데)
const CLICK_SLOP_PX = 3; // 이보다 적게 움직이면 끌기가 아니라 누르기
const DISSOLVE_MIN_PX = 30; // 디졸브 상자는 짧아도 이만큼은 보이게(가운데 기준)

/** 디졸브 상자 가운데 아이콘(나비넥타이 모양 — 두 장면이 겹쳐 넘어감). */
function BowTie() {
  return (
    <svg viewBox="0 0 16 12" className="h-3 w-4" aria-hidden>
      <path d="M1 1 L8 6 L1 11 Z M15 1 L8 6 L15 11 Z" fill="currentColor" />
    </svg>
  );
}

/** 디졸브 상자 양 끝 손잡이(‖) — 좌우로 끌어 길이 조절. */
function DissolveHandle({ side, onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      className={`absolute inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center ${side === "start" ? "left-0" : "right-0"}`}
      title="디졸브 길이 — 좌우로 끌어 늘이기·줄이기"
      aria-label={side === "start" ? "디졸브 앞 손잡이" : "디졸브 뒤 손잡이"}
    >
      <span className="flex gap-[2px]">
        <span className="h-3.5 w-[2px] rounded-full bg-white/90" />
        <span className="h-3.5 w-[2px] rounded-full bg-white/90" />
      </span>
    </div>
  );
}

/** 조각 하나의 파형 — 곡의 실제 위치대로 고른 막대(가운데 기준).
 *  높이: 곡 모양 × 트랙 볼륨 × 디졸브, 진하기: 시간별 볼륨(줄이기·페이드).
 *  막대가 많아서, 재생선이 움직이는 등 다른 이유로 화면이 다시 그려질 땐 건너뜁니다(memo, 아래 sameWave). */
const PieceWave = memo(function PieceWave({ start, length, offsetSeconds, fadeIn, fadeOut, songPeaks, songSeconds, volume, isSelected, mixer, voiceSeconds }) {
  const bars = Math.max(6, Math.min(400, Math.round(length * 4)));
  const entry = { start, end: start + length, fadeIn, fadeOut };
  const volumeFraction = volume / ClipGain.MAX;
  return (
    <div className="absolute inset-0 flex items-center gap-[1px] px-px py-1">
      {Array.from({ length: bars }, (_, i) => {
        const t = start + ((i + 0.5) / bars) * length;
        const pos = offsetSeconds + (t - start);
        const v = songPeaks[Math.min(songPeaks.length - 1, Math.max(0, Math.floor((pos / songSeconds) * songPeaks.length)))] || 0;
        const bar = MusicArrangement.waveBar(v, mixer.levelAt(t, voiceSeconds), MusicArrangement.pieceGain(entry, t), volumeFraction);
        return (
          <span
            key={i}
            className={`w-full rounded-sm ${isSelected ? "bg-amber-500" : "bg-sky-500"}`}
            style={{ height: `max(1px, ${bar.heightPercent}%)`, opacity: bar.opacity }}
          />
        );
      })}
    </div>
  );
}, sameWave);

/** mixer는 렌더마다 새로 만들어지므로, 그 대신 시간별 볼륨 값(levelKey)으로 비교합니다. */
function sameWave(a, b) {
  const keys = ["start", "length", "offsetSeconds", "fadeIn", "fadeOut", "songPeaks", "songSeconds", "volume", "isSelected", "voiceSeconds"];
  return keys.every((k) => a[k] === b[k]) && a.mixer.levelKey(a.voiceSeconds) === b.mixer.levelKey(b.voiceSeconds);
}

/** 배경음악 트랙 도구 버튼 — 트랙과 같은 하늘색 계열로 통일. active면 켜진 상태(진한 하늘색). */
function ToolButton({ icon: Icon, glyph, label, shortcut, onClick, disabled, title, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm transition disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-white disabled:text-stone-300 disabled:shadow-none ${
        active ? "border-sky-600 bg-sky-600 text-white" : "border-sky-200 bg-white text-sky-800 hover:bg-sky-50"
      }`}
    >
      {Icon ? <Icon size={11} aria-hidden /> : <span aria-hidden>{glyph}</span>}
      {label}
      {shortcut && (
        <kbd
          className={`rounded px-1 font-sans text-[9px] font-semibold ${
            active ? "bg-white/20 text-white" : "bg-sky-100 text-sky-700"
          } ${disabled ? "opacity-50" : ""}`}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

export default function MusicTrackLane({
  axis,
  arrangement, // 지금 화면에 보일 배치(끄는 중이면 그 미리보기)
  isArranged, // 편집한 배치인지(아니면 자동 — 곡이 짧으면 반복)
  mixer, // BackgroundMixer — 시간별 볼륨(더킹·페이드아웃)
  voiceSeconds,
  songPeaks,
  songSeconds,
  volume,
  isVolumeDragging,
  isDragging,
  backgroundName,
  playheadSeconds,
  selectedId,
  onSelect, // (id | null, seconds?) => void
  onChange, // (MusicArrangement) => void
  onPieceEdgeStart, // (e, pieceId, edge) — 편집한 배치의 조각 가장자리
  onRemoveMusic = null, // () => void — 마지막 남은 조각을 지우면 배경음악 자체를 뺍니다
  onAutoEdgeStart, // (e) — 자동 배치의 맨 앞·맨 뒤 가장자리(data-edge)
  onVolumeDragStart,
  resetLabel = "", // 있으면 되돌리기 버튼(자동: "끝 자동 맞춤", 편집됨: "자동 배치로")
  resetTitle = "",
  onReset,
  VolumeBadge,
}) {
  const [clipboard, setClipboard] = useState(null); // MusicPiece
  const [dissolveDrag, setDissolveDrag] = useState(null); // { kind: "trim" | "slip" | "dissolve", id, edge, startX, rect }
  const [draftDissolve, setDraftDissolve] = useState(null); // 손잡이를 끈 거리(초, 오른쪽 +)
  const [isTrimTool, setIsTrimTool] = useState(false); // 트리밍 도구(T) — 켜면 조각 안을 끌어 곡 위치를 옮김
  const laneRef = useRef(null);

  // 디졸브 손잡이를 끄는 동안엔 그 길이로 미리 보여 줍니다(놓으면 반영).
  const shown =
    dissolveDrag && draftDissolve != null
      ? arrangement.applyDrag(dissolveDrag, draftDissolve, songSeconds)
      : arrangement;
  const layout = shown.layout;
  const selection = MusicArrangement.parseSelection(selectedId);
  const selectedPieceId = selection.kind === "piece" ? selection.id : null;
  const selectedDissolveId = selection.kind === "dissolve" ? selection.id : null;
  const selected = layout.find((e) => e.piece.id === selectedPieceId) || null;
  const trackStart = shown.startSeconds;
  const trackEnd = shown.endSeconds;

  const actions = {
    copy() {
      if (selected) setClipboard(selected.piece);
    },
    paste() {
      if (!clipboard) return;
      const next = arrangement.paste(clipboard, selected?.piece.id || null);
      onChange(next);
      onSelect(MusicArrangement.pastedId(arrangement, next));
    },
    split() {
      if (!arrangement.canSplitAt(playheadSeconds)) return;
      onChange(arrangement.splitAt(playheadSeconds));
    },
    remove() {
      if (selectedDissolveId) {
        onChange(arrangement.setDissolve(selectedDissolveId, 0));
        onSelect(null);
        return;
      }
      if (!selected) return;
      if (arrangement.pieces.length <= 1) {
        // 조각이 하나뿐이면 배경음악 자체를 뺍니다(라이브러리에서 다시 고를 수 있어요).
        if (!onRemoveMusic) return;
        onSelect(null);
        onRemoveMusic();
        return;
      }
      onChange(arrangement.remove(selected.piece.id));
      onSelect(null);
    },
    dissolve() {
      const id = selectedDissolveId || selected?.piece.id;
      const piece = id ? arrangement.find(id) : null;
      if (!piece || arrangement.indexOf(id) === 0) return;
      if (piece.dissolveSeconds) {
        onChange(arrangement.setDissolve(id, 0));
        onSelect(null);
        return;
      }
      if (!arrangement.canDissolve(id)) return;
      onChange(arrangement.toggleDissolve(id));
      onSelect(MusicArrangement.dissolveKey(id));
    },
    startDissolveDrag(e, id, edge) {
      if (e.button !== 0 || !laneRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const piece = arrangement.find(id);
      if (!piece) return;
      onSelect(MusicArrangement.dissolveKey(id));
      setDissolveDrag({ kind: "dissolve", id, edge, startX: e.clientX, rect: laneRef.current.getBoundingClientRect() });
      setDraftDissolve(0);
    },
    /** 조각 안 트리밍 시작(트리밍 도구가 켜졌을 때) — 거의 안 움직이고 놓으면 그냥 누르기(조각 고르기). */
    startSlip(e, id) {
      if (!isTrimTool || e.button !== 0 || !laneRef.current) return;
      if (e.target.closest("[data-edge]")) return; // 끝(롤링) 손잡이는 그대로
      e.preventDefault();
      setDissolveDrag({ kind: "slip", id, edge: null, startX: e.clientX, rect: laneRef.current.getBoundingClientRect() });
      setDraftDissolve(0);
    },
    toggleTrimTool() {
      setIsTrimTool((on) => !on);
    },
    /** 트리밍 시작 — id 조각과 앞 조각 사이 경계. 거의 안 움직이고 놓으면 그냥 누르기(디졸브 상자 고르기)로 둡니다. */
    startTrim(e, id) {
      if (e.button !== 0 || !laneRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setDissolveDrag({ kind: "trim", id, edge: null, startX: e.clientX, rect: laneRef.current.getBoundingClientRect() });
      setDraftDissolve(0);
    },
  };

  // 디졸브 손잡이 끌기 — 끈 손잡이가 마우스를 따라갑니다(앞 손잡이는 왼쪽, 뒤 손잡이는 오른쪽으로 끌면 길어짐).
  useEffect(() => {
    if (!dissolveDrag) return undefined;
    const { startX, rect } = dissolveDrag;
    const movedAt = (clientX) => axis.secondsAt(clientX, rect) - axis.secondsAt(startX, rect);
    // 마우스가 움직일 때마다가 아니라 화면이 다시 그려질 때 한 번만 반영합니다(끌기가 버벅이지 않게).
    let frame = 0;
    let lastX = startX;
    function handleMove(e) {
      lastX = e.clientX;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setDraftDissolve(movedAt(lastX));
      });
    }
    function handleUp(e) {
      const isClick = Math.abs(e.clientX - startX) < CLICK_SLOP_PX;
      if (!isClick) {
        // 끌기를 마친 뒤 따라오는 클릭(선택 풀기·재생선 이동)은 한 번 막습니다.
        const swallow = (ev) => ev.stopPropagation();
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      }
      const next = isClick ? arrangement : arrangement.applyDrag(dissolveDrag, movedAt(e.clientX), songSeconds);
      setDissolveDrag(null);
      setDraftDissolve(null);
      if (next !== arrangement) onChange(next);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dissolveDrag, arrangement, axis, onChange, songSeconds]);

  // 키보드 — B(자르기)·T(트리밍 도구)는 언제나, 복사·붙이기·삭제는 배경음악 조각이나 디졸브를 골랐을 때.
  // (목소리 클립을 고르면 이쪽 선택은 풀립니다.)
  useEffect(() => {
    function handleKeyDown(e) {
      if (FocusGuard.isTyping() || e.repeat) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (!mod && !e.altKey && key === "b") {
        e.preventDefault();
        actions.split();
      } else if (!mod && !e.altKey && key === "t") {
        e.preventDefault();
        actions.toggleTrimTool();
      } else if (!selectedId) {
        return;
      } else if (mod && key === "c") {
        e.preventDefault();
        actions.copy();
      } else if (mod && key === "v") {
        e.preventDefault();
        actions.paste();
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        actions.remove();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const dissolveTargetId = selectedDissolveId || selected?.piece.id || null;
  const dissolveTarget = dissolveTargetId ? shown.find(dissolveTargetId) : null;
  const hasDissolve = Boolean(dissolveTarget?.dissolveSeconds);
  const canDissolve = Boolean(dissolveTarget && (hasDissolve || arrangement.canDissolve(dissolveTargetId)));
  const dissolveTitle = !dissolveTarget || shown.indexOf(dissolveTargetId) === 0
    ? "두 번째 이후 조각을 고르면 앞 조각과 디졸브할 수 있어요"
    : !canDissolve
      ? "조각이 너무 짧아 디졸브할 수 없어요 (두 조각 모두 3초 이상 필요)"
      : hasDissolve
        ? "디졸브를 빼고 바로 이어지게 해요"
        : `고른 조각과 앞 조각을 ${MusicArrangement.DISSOLVE_LABEL} 겹쳐 부드럽게 넘겨요`;

  return (
    <div className="mt-1 rounded-lg bg-sky-50/60 p-1.5">
      <div className="mb-1 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="sticky left-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700">
          <Music size={11} /> 배경음악 트랙
          <span className="font-medium text-sky-600">
            · {backgroundName || "배경음악"} · {TimeFormat.precise(trackStart)}~{TimeFormat.precise(trackEnd)} · 조각 {layout.length}개 · 볼륨{" "}
            {ClipGain.label(volume)}
          </span>
          {onRemoveMusic && !isDragging && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                onRemoveMusic();
              }}
              className="ml-1 rounded-full border border-sky-300 bg-white px-1.5 py-px text-[10px] font-medium text-sky-700 hover:border-rose-300 hover:text-rose-600"
              title="배경음악을 통째로 빼요. 라이브러리에서 다시 고를 수 있어요"
            >
              배경음악 빼기
            </button>
          )}
          {resetLabel && !isDragging && (
            <button
              type="button"
              onClick={onReset}
              className="ml-1 rounded-full border border-sky-300 bg-white px-1.5 py-px text-[10px] font-medium text-sky-700"
              title={resetTitle}
            >
              {resetLabel}
            </button>
          )}
        </span>

        {/* 편집 도구 — 조각을 고르면 켜집니다. 자르기는 재생선 자리에서. */}
        <span className="sticky left-1.5 inline-flex flex-wrap items-center gap-1">
          <ToolButton
            icon={ClipboardCopy}
            label="복사"
            shortcut="⌘C"
            onClick={actions.copy}
            disabled={!selected}
            title="고른 조각 복사 (맥 Command+C, 윈도 Ctrl+C)"
          />
          <ToolButton
            icon={ClipboardPaste}
            label="붙이기"
            shortcut="⌘V"
            onClick={actions.paste}
            disabled={!clipboard}
            title="복사한 조각을 고른 조각 바로 뒤(없으면 맨 뒤)에 붙여요 (맥 Command+V, 윈도 Ctrl+V)"
          />
          <ToolButton
            icon={Scissors}
            label="자르기"
            shortcut="B"
            onClick={actions.split}
            disabled={!arrangement.canSplitAt(playheadSeconds)}
            title="재생선 자리에서 배경음악 조각을 둘로 잘라요 (B)"
          />
          <ToolButton
            icon={MoveHorizontal}
            label={isTrimTool ? "트리밍 켜짐" : "트리밍"}
            shortcut="T"
            active={isTrimTool}
            onClick={actions.toggleTrimTool}
            title={
              isTrimTool
                ? "트리밍 도구를 꺼요 (T)"
                : "켜고 조각 안을 좌우로 끌면, 조각 자리와 길이는 그대로 두고 그 안에서 들리는 곡 위치만 옮겨요 (T)"
            }
          />
          <ToolButton
            icon={Trash2}
            label="삭제"
            shortcut="Del"
            onClick={actions.remove}
            disabled={!selectedDissolveId && (!selected || (layout.length <= 1 && !onRemoveMusic))}
            title={
              selectedDissolveId
                ? "고른 디졸브를 지워요 (Delete)"
                : layout.length <= 1
                  ? "배경음악을 빼요. 라이브러리에서 다시 고를 수 있어요 (Delete)"
                  : "고른 조각을 빼요. 뒤 조각이 당겨져요 (Delete)"
            }
          />
          <ToolButton
            glyph="⧓"
            label={hasDissolve ? `디졸브 ${MusicArrangement.frameLabel(dissolveTarget.dissolveSeconds)} · 빼기` : "디졸브 넣기"}
            active={hasDissolve}
            onClick={actions.dissolve}
            disabled={!canDissolve}
            title={dissolveTitle}
          />
          {clipboard && (
            <span className="text-[10px] text-sky-600/80">복사됨 · {TimeFormat.precise(clipboard.lengthSeconds)}</span>
          )}
        </span>
      </div>

      <div ref={laneRef} className="relative h-16">
        {layout.map((entry) => {
          const { piece, start, end } = entry;
          const length = end - start;
          const isSelected = piece.id === selectedPieceId;
          const isFirst = entry.index === 0;
          const isLast = entry.index === layout.length - 1;
          // 자동 배치는 맨 앞·맨 뒤만 끌 수 있고(예전 방식), 편집한 배치는 모든 조각의 양 끝을 끌 수 있어요.
          const edges = isArranged ? ["start", "end"] : [isFirst && "start", isLast && "end"].filter(Boolean);
          return (
            <div
              key={piece.id}
              role="button"
              tabIndex={-1}
              aria-pressed={isSelected}
              onMouseDown={(e) => actions.startSlip(e, piece.id)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(isSelected ? null : piece.id, axis.secondsAt(e.clientX, e.currentTarget.parentElement.getBoundingClientRect()));
              }}
              style={{
                left: `${axis.percentOf(start)}%`,
                width: `${axis.percentOf(length)}%`,
                zIndex: isSelected ? 3 : 1 + (entry.index % 2),
                cursor: isTrimTool ? EditCursor.SLIP : "pointer",
              }}
              title={isTrimTool ? "트리밍 — 좌우로 끌면 조각 자리는 그대로, 안의 곡 위치만 옮겨져요" : undefined}
              className={`group absolute inset-y-0 overflow-hidden rounded-md ${isTrimTool ? "bg-sky-200/70" : "bg-sky-100/75"}`}
            >
              <PieceWave
                start={start}
                length={length}
                offsetSeconds={piece.offsetSeconds}
                fadeIn={entry.fadeIn}
                fadeOut={entry.fadeOut}
                songPeaks={songPeaks}
                songSeconds={songSeconds}
                volume={volume}
                isSelected={isSelected}
                mixer={mixer}
                voiceSeconds={voiceSeconds}
              />
              <div
                className={`pointer-events-none absolute inset-0 rounded-md border-2 ${
                  isSelected ? "border-amber-500" : isDragging ? "border-amber-400/70" : "border-sky-300/70 group-hover:border-sky-400"
                }`}
              />
              {edges.map((edge) => (
                <div
                  key={edge}
                  data-edge={edge}
                  onMouseDown={(e) => (isArranged ? onPieceEdgeStart(e, piece.id, edge) : onAutoEdgeStart(e))}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: EDGE_PX, cursor: edge === "start" ? EditCursor.RIPPLE_HEAD : EditCursor.RIPPLE_TAIL }}
                  className={`group/edge absolute inset-y-0 z-20 ${edge === "start" ? "left-0" : "right-0"}`}
                  title={
                    edge === "start"
                      ? "롤링 — 이 조각 앞부분을 늘이거나 줄여요(뒤 조각들이 따라 움직여요)"
                      : "롤링 — 이 조각 뒷부분을 늘이거나 줄여요(뒤 조각들이 따라 움직여요)"
                  }
                  aria-label={edge === "start" ? "배경음악 조각 앞 끝" : "배경음악 조각 뒤 끝"}
                >
                  <span
                    className={`absolute inset-y-0 w-1 bg-sky-500/70 transition group-hover/edge:w-1.5 group-hover/edge:bg-amber-500 ${
                      edge === "start" ? "left-0 rounded-l-md" : "right-0 rounded-r-md"
                    }`}
                  />
                </div>
              ))}
            </div>
          );
        })}

        {/* 트리밍 자리 — 디졸브 없이 붙은 두 조각 사이. 끌면 경계만 옮겨져요. */}
        {layout
          .filter((entry) => entry.index > 0 && entry.fadeIn === 0)
          .map((entry) => (
            <div
              key={`trim-${entry.piece.id}`}
              onMouseDown={(e) => actions.startTrim(e, entry.piece.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ left: `${axis.percentOf(entry.start)}%`, width: TRIM_PX, cursor: EditCursor.TRIM }}
              className="group/trim absolute inset-y-0 z-[14] -translate-x-1/2"
              title="트리밍 — 두 조각 사이 경계를 옮겨요(두 조각을 합친 시간은 그대로)"
              aria-label="두 조각 사이 경계"
            >
              <span
                className={`pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition group-hover/trim:w-1 group-hover/trim:bg-amber-500 ${
                  dissolveDrag?.kind === "trim" && dissolveDrag.id === entry.piece.id ? "w-1 bg-amber-500" : "bg-sky-600/70"
                }`}
              />
            </div>
          ))}

        {/* 디졸브 상자 — 두 조각이 겹친 곳. 누르면 고르기(Delete로 지우기), 양 끝 손잡이로 길이 조절. */}
        {layout
          .filter((entry) => entry.fadeIn > 0)
          .map((entry) => {
            const { piece, start, fadeIn } = entry;
            const isSel = piece.id === selectedDissolveId;
            const isResizing = dissolveDrag?.id === piece.id && dissolveDrag.kind === "dissolve";
            return (
              <div
                key={`dissolve-${piece.id}`}
                role="button"
                tabIndex={-1}
                aria-pressed={isSel}
                aria-label={`디졸브 ${MusicArrangement.frameLabel(fadeIn)}`}
                title={`디졸브 ${MusicArrangement.frameLabel(fadeIn)} — 누르면 고르기(Delete로 지우기), 가운데를 끌면 트리밍, 양 끝 ‖로 디졸브 길이 조절`}
                onMouseDown={(e) => actions.startTrim(e, piece.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(isSel ? null : MusicArrangement.dissolveKey(piece.id));
                }}
                style={{
                  left: `${axis.percentOf(start + fadeIn / 2)}%`,
                  width: `max(${DISSOLVE_MIN_PX}px, ${axis.percentOf(fadeIn)}%)`,
                  cursor: EditCursor.TRIM,
                }}
                className={`absolute inset-y-0 z-[15] flex -translate-x-1/2 items-center justify-center rounded-md border-2 text-white shadow-md transition-colors ${
                  isSel || isResizing ? "border-amber-400 bg-stone-600/90" : "border-stone-300/80 bg-stone-500/80 hover:bg-stone-600/85"
                }`}
              >
                <DissolveHandle side="start" onMouseDown={(e) => actions.startDissolveDrag(e, piece.id, "start")} />
                <BowTie />
                <DissolveHandle side="end" onMouseDown={(e) => actions.startDissolveDrag(e, piece.id, "end")} />
                {(isSel || isResizing) && (
                  <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                    {MusicArrangement.frameLabel(fadeIn)}
                  </span>
                )}
              </div>
            );
          })}

        {/* 트랙 전체 볼륨 손잡이 — 배경음악 전체 구간의 가운데 */}
        <div
          className="pointer-events-none absolute inset-y-0 z-10"
          style={{ left: `${axis.percentOf(trackStart)}%`, width: `${axis.percentOf(trackEnd - trackStart)}%` }}
        >
          <div
            onMouseDown={onVolumeDragStart}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute inset-y-0 left-1/2 flex w-6 -translate-x-1/2 cursor-ns-resize items-start justify-center"
            title={`배경음악 볼륨 ${ClipGain.label(volume)} (위아래로 끌어서 5%씩 조절)`}
          >
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-sky-500/60" />
            <div
              className="pointer-events-none absolute left-1/2 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-sky-600 shadow"
              style={{ top: `${ClipGain.handleTopPercent(volume)}%` }}
            >
              <GripHorizontal size={8} className="text-white" />
            </div>
            <VolumeBadge gain={volume} active={isVolumeDragging} tone="sky" />
          </div>
        </div>
      </div>

      {!isArranged && layout.length > 1 && (
        <p className="mt-1 text-[10px] text-sky-700/70">
          곡이 짧아서 자동으로 {layout.length}번 이어졌어요. 조각을 골라 자르기·삭제·디졸브를 하면 원하는 대로 다듬을 수 있어요.
        </p>
      )}
    </div>
  );
}

