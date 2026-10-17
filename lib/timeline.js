"use client";

// 편집 타임라인의 도메인 로직 — 화면(ClipTimeline)과 분리해서 클래스로 둡니다.
//   Segment         — 클립/빈 공간 세그먼트 생성
//   Timeline        — 세그먼트 배열에 대한 불변(immutable) 편집 연산
//   PreviewPlayer   — AudioBufferSourceNode로 미리듣기 재생/정지/경과 시간
//   TimelineZoom    — 가로 확대 배율 단계
//   PointerDrag     — window mousemove/mouseup 리스너를 묶어 관리하는 드래그 세션
//   UndoHistory     — 실행 취소 스택
//   FocusGuard      — 입력창 포커스 중엔 단축키 무시
//
// segments 자체는 React 상태에 그대로 들어가는 평범한 객체 배열로 유지합니다
// (클래스 인스턴스를 상태에 넣으면 스프레드 복사 때 프로토타입이 사라지기 때문).

import { AudioBufferOps, AudioEngine, ClipGain, WaveformAnalyzer } from "@/lib/audio";

export class Segment {
  static #clipCounter = 0;
  static #splitCounter = 0;

  static nextClipId() {
    Segment.#clipCounter += 1;
    return `clip-${Date.now()}-${Segment.#clipCounter}`;
  }

  static nextSplitId(base, suffix) {
    Segment.#splitCounter += 1;
    return `${base}-${suffix}${Segment.#splitCounter}`;
  }

  /** 녹음/업로드한 버퍼로 새 클립을 만듭니다. 기본 볼륨은 항상 중앙(1 = 원본
   *  그대로)에서 시작합니다 — 피크 기준 자동 정규화를 쓰면 녹음 직후 오디오는
   *  최대치(200%)로 튀는 경우가 있어서, 소스와 상관없이 1로 통일했습니다. */
  static clip({ buffer, source, name }) {
    return {
      id: Segment.nextClipId(),
      type: "clip",
      source,
      name,
      buffer,
      duration: buffer.duration,
      waveform: WaveformAnalyzer.peaksForBuffer(buffer),
      gain: ClipGain.DEFAULT,
    };
  }

  static gap(id, duration) {
    return { id, type: "gap", duration };
  }

  static label(seg, idx) {
    if (seg.type === "gap") return "빈 공간";
    return `${idx + 1}. ${seg.name}`;
  }
}

export class Timeline {
  // 클립의 맨 앞/뒤 끝에서 이 시간(초) 이내로는 자르지 않습니다(너무 얇은
  // 조각 방지). 클립 길이 비율(예전 4%)로 잡으면 긴 클립에서 가장자리가
  // 수십 초가 돼서 자석 스냅 지점이 잘리지 않는 버그가 있었기 때문에,
  // 절대 시간 기준으로 아주 짧게(프레임 단위) 잡습니다.
  static MIN_SPLIT_SECONDS = 0.05;

  constructor(segments) {
    this.segments = segments;
  }

  get totalSeconds() {
    return this.segments.reduce((sum, s) => sum + (s.duration || 0), 0);
  }

  get hasGap() {
    return this.segments.some((s) => s.type === "gap");
  }

  get clips() {
    return this.segments.filter((s) => s.type === "clip");
  }

  find(id) {
    return this.segments.find((s) => s.id === id) || null;
  }

  /** idx번째 구간이 시작되는 절대 시간(초) — 배경음악 인트로(leadSeconds)가
   *  있으면 그만큼 뒤에서 시작합니다. */
  startSecondsOf(idx, leadSeconds = 0) {
    let cumulative = leadSeconds;
    for (let i = 0; i < idx; i++) {
      cumulative += this.segments[i].duration || 0;
    }
    return cumulative;
  }

  /** 클립 안의 fraction 지점이 너무 끝에 붙지 않아 자를 수 있는지. */
  static canSplitAt(seg, fraction) {
    const minFraction =
      seg.duration > 0 ? Math.min(0.45, Timeline.MIN_SPLIT_SECONDS / seg.duration) : 0.04;
    return fraction >= minFraction && fraction <= 1 - minFraction;
  }

  /** 클립을 fraction 지점에서 둘로 자릅니다. { segments, leftId } 또는 null. */
  split(id, fraction) {
    const idx = this.segments.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const seg = this.segments[idx];
    if (!seg.buffer) return null;
    const left = Timeline.#half(seg, AudioBufferOps.slice(seg.buffer, 0, fraction), "a", "앞");
    const right = Timeline.#half(seg, AudioBufferOps.slice(seg.buffer, fraction, 1), "b", "뒤");
    const next = [...this.segments];
    next.splice(idx, 1, left, right);
    return { segments: next, leftId: left.id };
  }

  static #half(seg, buffer, suffix, label) {
    return {
      ...seg,
      id: Segment.nextSplitId(seg.id, suffix),
      buffer,
      duration: buffer.duration,
      waveform: WaveformAnalyzer.peaksForBuffer(buffer),
      name: `${seg.name} (${label})`,
    };
  }

  /** 클립을 같은 길이의 빈 공간으로 바꾸고(마그네틱 이어붙이기는 빈 공간을
   *  지울 때 따로 일어남), 빈 공간이면 지워서 양옆을 이어붙입니다. */
  deleteSegment(id) {
    const target = this.find(id);
    if (!target) return this.segments;
    if (target.type === "clip") {
      return this.segments.map((s) => (s.id === id ? Segment.gap(s.id, s.duration) : s));
    }
    return this.remove(id);
  }

  /** 빈 공간을 남기지 않고 곧바로 없앱니다(뒤 클립이 앞으로 당겨짐). */
  remove(id) {
    return this.segments.filter((s) => s.id !== id);
  }

  joinAll() {
    return this.clips;
  }

  move(fromId, toId) {
    const from = this.segments.findIndex((s) => s.id === fromId);
    const to = this.segments.findIndex((s) => s.id === toId);
    if (from === -1 || to === -1) return null;
    const next = [...this.segments];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  setGain(id, gain) {
    return this.segments.map((s) => (s.id === id ? { ...s, gain } : s));
  }

  /** Build one continuous AudioBuffer from the segments, inserting real
   *  silence for gaps — used both for live preview playback in the editor
   *  and (skipping gaps) for the final exported mixdown. Each clip's own
   *  volume (seg.gain) is applied here so every playback path hears the
   *  same result. */
  toBuffer({ skipGaps = false } = {}) {
    const parts = [];
    for (const seg of this.segments) {
      if (seg.type === "clip" && seg.buffer) {
        parts.push(AudioBufferOps.applyGain(seg.buffer, seg.gain ?? ClipGain.DEFAULT));
      } else if (seg.type === "gap" && !skipGaps) {
        parts.push(AudioBufferOps.silence(seg.duration || 0, this.#sampleRate()));
      }
    }
    if (parts.length === 0) return null;
    return AudioBufferOps.concat(parts);
  }

  #sampleRate() {
    return this.segments.find((s) => s.buffer)?.buffer?.sampleRate || AudioEngine.context.sampleRate;
  }
}

/** 미리듣기 재생기 — 한 번에 하나의 AudioBufferSourceNode만 재생합니다. */
export class PreviewPlayer {
  #source = null;
  #startedAt = 0;
  #buffer = null;

  get isActive() {
    return this.#source !== null;
  }

  get buffer() {
    return this.#buffer;
  }

  /** 재생 시작 후 흐른 시간(초). */
  get elapsedSeconds() {
    return AudioEngine.context.currentTime - this.#startedAt;
  }

  play(buffer, offsetSeconds) {
    if (!buffer || buffer.duration <= 0) return false;
    this.stop();
    const ctx = AudioEngine.context;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const clampedOffset = Math.max(0, Math.min(buffer.duration - 0.02, offsetSeconds));
    source.start(0, clampedOffset);
    source.onended = () => {
      if (this.#source === source) this.#source = null;
    };
    this.#source = source;
    this.#buffer = buffer;
    this.#startedAt = ctx.currentTime - clampedOffset;
    return true;
  }

  stop() {
    if (!this.#source) return;
    try {
      this.#source.onended = null;
      this.#source.stop();
    } catch (e) {
      // already stopped
    }
    this.#source = null;
  }
}

// 파형 가로 확대 — 오디오 길이는 그대로 두고 파형이 그려지는 폭만 넓힙니다.
// 100%가 기본이자 최소값이고, 누를 때마다 두 배씩 커져서 최대 3200%까지.
export class TimelineZoom {
  static MIN = 100;
  static MAX = 3200;

  static in(level) {
    return Math.min(TimelineZoom.MAX, level * 2);
  }

  static out(level) {
    return Math.max(TimelineZoom.MIN, Math.round(level / 2));
  }
}

/** window에 mousemove/mouseup 리스너를 붙였다가 끝나면(또는 컴포넌트가
 *  사라지면) 함께 정리하는 드래그 세션. 드래그 중 상태(state)도 함께 들고
 *  있어서, 컴포넌트는 ref 하나로 이 객체만 관리하면 됩니다. */
export class PointerDrag {
  #onMove;
  #onEnd;

  constructor(state, { onMove, onEnd }) {
    this.state = state;
    this.#onMove = (e) => onMove(e, this.state);
    this.#onEnd = (e) => {
      this.dispose();
      onEnd?.(e, this.state);
    };
    window.addEventListener("mousemove", this.#onMove);
    window.addEventListener("mouseup", this.#onEnd);
  }

  dispose() {
    window.removeEventListener("mousemove", this.#onMove);
    window.removeEventListener("mouseup", this.#onEnd);
  }
}

/** 편집 상태 실행 취소 스택(이론상 메모리가 허용하는 한 무제한). */
export class UndoHistory {
  #stack = [];

  get canUndo() {
    return this.#stack.length > 0;
  }

  push(snapshot) {
    this.#stack.push(snapshot);
  }

  pop() {
    return this.#stack.pop();
  }

  clear() {
    this.#stack = [];
  }
}

/** 전역 키보드 단축키 보조 — 입력창/텍스트 편집 중에는 단축키가 타이핑을
 *  가로채지 않도록 합니다. */
export class FocusGuard {
  static isTyping() {
    const active = document.activeElement;
    const tag = active?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || Boolean(active?.isContentEditable);
  }
}
