"use client";

// 편집 타임라인의 도메인 로직 — 화면(ClipTimeline)과 분리해서 클래스로 둡니다.
//   Segment         — 클립/빈 공간 세그먼트 생성(클립은 원본 + 사용 구간 샘플 번호)
//   Timeline        — 세그먼트 배열에 대한 불변(immutable) 편집 연산(자르기·트리밍·삭제·이동)
//   TimeAxis        — 시간(초) ↔ 화면 위치 변환 하나로 재생선·자르기·트리밍이 같은 기준을 씀
//   ClipTrim        — 클립 가장자리를 끌 때의 새 사용 구간 계산
//   PreviewPlayer   — AudioBufferSourceNode로 미리듣기 재생/정지/경과 시간
//   TimelineZoom    — 가로 확대 배율 단계
//   PointerDrag     — window mousemove/mouseup 리스너를 묶어 관리하는 드래그 세션
//   UndoHistory     — 실행 취소 스택
//   FocusGuard      — 입력창 포커스 중엔 단축키 무시
//
// segments 자체는 React 상태에 그대로 들어가는 평범한 객체 배열로 유지합니다
// (클래스 인스턴스를 상태에 넣으면 스프레드 복사 때 프로토타입이 사라지기 때문).
//
// 클립은 "원본(origin) 오디오 + 사용 구간 [inSample, outSample)"로 둡니다. 자르면 두 조각이 같은
// 원본을 나눠 갖고 구간만 달라서, 나중에 트리밍으로 잘린 부분을 다시 늘려 되살릴 수 있습니다.
// buffer는 그 구간을 실제로 잘라낸 버퍼(재생·저장용)이고, 구간이 바뀔 때만 다시 만듭니다.

import { AudioBufferOps, AudioEngine, ClipGain, PeakMap } from "@/lib/audio";
import { LevelMeter } from "@/lib/levelMeter";

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
  /** originSource: 원본을 다시 구할 곳 — { blob }(녹음·올린 파일) | { url }(서버에 있는 오디오) | { path }(작업 저장소).
   *  "작업 저장하기"가 이것으로 원본을 한 번만 올리거나 주소만 남깁니다. */
  static clip({ buffer, source, name, originSource = null }) {
    const base = {
      id: Segment.nextClipId(),
      type: "clip",
      source,
      name,
      origin: buffer,
      originSource,
      peaks: PeakMap.fromBuffer(buffer),
      gain: ClipGain.DEFAULT,
    };
    return Segment.withRange(base, 0, buffer.length);
  }

  /** 저장해 둔 클립 되살리기 — 같은 원본을 나눠 쓰던 조각들은 같은 buffer·peaks를 넘겨 받습니다. */
  static restore({ buffer, peaks, originSource, source, name, inSample, outSample, gain }) {
    const base = {
      id: Segment.nextClipId(),
      type: "clip",
      source,
      name,
      origin: buffer,
      originSource,
      peaks: peaks || PeakMap.fromBuffer(buffer),
      gain: Number.isFinite(gain) ? gain : ClipGain.DEFAULT,
    };
    const start = Math.max(0, Math.min(buffer.length - 1, inSample ?? 0));
    const end = Math.max(start + 1, Math.min(buffer.length, outSample ?? buffer.length));
    return Segment.withRange(base, start, end);
  }

  /** 사용 구간을 바꾼 클립 — 실제 버퍼까지 다시 잘라 둡니다(재생·저장에 쓰임). */
  static withRange(seg, inSample, outSample) {
    const buffer = AudioBufferOps.sliceSamples(seg.origin, inSample, outSample);
    return { ...seg, inSample, outSample, buffer, duration: buffer.duration };
  }

  /** 드래그 중 화면에만 보여줄 구간 — 버퍼는 자르지 않고 길이만 바꿉니다(손을 떼면 withRange). */
  static preview(seg, inSample, outSample) {
    return { ...seg, inSample, outSample, duration: (outSample - inSample) / seg.origin.sampleRate };
  }

  static gap(id, duration) {
    return { id, type: "gap", duration };
  }

  static label(seg, idx) {
    if (seg.type === "gap") return "빈 공간";
    return `${idx + 1}. ${seg.name}`;
  }

  /** 원본에서 앞/뒤로 잘려 숨어 있는 부분이 있는지 — 트리밍으로 되살릴 수 있는 쪽 표시용. */
  static hiddenEdges(seg) {
    if (seg.type !== "clip" || !seg.origin) return { start: false, end: false };
    return { start: seg.inSample > 0, end: seg.outSample < seg.origin.length };
  }
}

export class Timeline {
  // 자르기·트리밍 뒤 남는 조각의 최소 길이(초) — 너무 얇은 조각 방지.
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

  /** 절대 시간 seconds에 놓인 구간 { idx, seg, startSeconds, offsetSeconds } 또는 null(인트로·꼬리). */
  locate(seconds, leadSeconds = 0) {
    let start = leadSeconds;
    for (let idx = 0; idx < this.segments.length; idx++) {
      const seg = this.segments[idx];
      const end = start + (seg.duration || 0);
      if (seconds >= start && seconds < end) return { idx, seg, startSeconds: start, offsetSeconds: seconds - start };
      start = end;
    }
    return null;
  }

  /** 클립 안 offsetSeconds 지점에서 자를 수 있는지(양쪽 조각이 최소 길이 이상). */
  static canSplitAt(seg, offsetSeconds) {
    return (
      seg.type === "clip" &&
      offsetSeconds >= Timeline.MIN_SPLIT_SECONDS &&
      offsetSeconds <= (seg.duration || 0) - Timeline.MIN_SPLIT_SECONDS
    );
  }

  /** 클립을 클립 안 offsetSeconds 지점(샘플 단위로 반올림)에서 둘로 자릅니다. { segments, leftId } 또는 null.
   *  두 조각은 같은 원본을 나눠 갖고, 앞 조각의 끝 샘플 = 뒤 조각의 시작 샘플입니다. */
  split(id, offsetSeconds) {
    const idx = this.segments.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const seg = this.segments[idx];
    if (!seg.origin) return null;
    const cut = seg.inSample + Math.round(offsetSeconds * seg.origin.sampleRate);
    if (cut <= seg.inSample || cut >= seg.outSample) return null;
    const left = Segment.withRange({ ...seg, id: Segment.nextSplitId(seg.id, "a"), name: `${seg.name} (앞)` }, seg.inSample, cut);
    const right = Segment.withRange({ ...seg, id: Segment.nextSplitId(seg.id, "b"), name: `${seg.name} (뒤)` }, cut, seg.outSample);
    const next = [...this.segments];
    next.splice(idx, 1, left, right);
    return { segments: next, leftId: left.id };
  }

  /** 클립의 사용 구간을 바꿉니다(트리밍). 뒤 클립들은 마그네틱으로 따라 움직입니다. */
  trim(id, inSample, outSample) {
    return this.segments.map((s) => (s.id === id ? Segment.withRange(s, inSample, outSample) : s));
  }

  /** 롤링 — 붙어 있는 두 클립 사이 경계를 옮깁니다(앞 클립 끝과 뒤 클립 시작을 함께). 전체 길이는 그대로. */
  roll(leftId, rightId, leftOut, rightIn) {
    return this.segments.map((s) => {
      if (s.id === leftId) return Segment.withRange(s, s.inSample, leftOut);
      if (s.id === rightId) return Segment.withRange(s, rightIn, s.outSample);
      return s;
    });
  }

  /** idx번째와 idx+1번째가 모두 클립이면 그 둘(롤링할 수 있는 경계), 아니면 null. */
  neighborsAt(idx) {
    const left = this.segments[idx];
    const right = this.segments[idx + 1];
    return left?.type === "clip" && right?.type === "clip" ? { left, right } : null;
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

/** 타임라인 전체 길이(초)와 화면 가로 위치를 서로 바꿉니다. 클립 배치, 재생선, 자르기 표시선,
 *  클릭 위치 계산이 모두 이 한 가지 기준을 쓰므로 "보이는 선 = 실제로 잘리는 곳"이 됩니다. 불변. */
export class TimeAxis {
  constructor(seconds) {
    this.seconds = Math.max(0, seconds || 0);
    Object.freeze(this);
  }

  /** 시간 → 전체 폭에 대한 % (클립·선의 left/width). */
  percentOf(seconds) {
    return this.seconds > 0 ? (seconds / this.seconds) * 100 : 0;
  }

  /** 마우스 x좌표 → 시간(초). rect는 타임라인 줄 전체(확대된 폭)의 getBoundingClientRect(). */
  secondsAt(clientX, rect) {
    if (!rect || rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * this.seconds;
  }

  pixelsPerSecond(rect) {
    return this.seconds > 0 && rect ? rect.width / this.seconds : 0;
  }
}

/** 클립 가장자리를 끌어서 사용 구간을 늘리고 줄이는 계산(트리밍). edge: "start" | "end". */
export class ClipTrim {
  static EDGES = Object.freeze({ START: "start", END: "end" });

  /** deltaSeconds만큼 끌었을 때의 새 { inSample, outSample } — 원본 범위와 최소 길이 안으로 맞춥니다. */
  static range(seg, edge, deltaSeconds, from = seg) {
    const rate = seg.origin.sampleRate;
    const minSamples = Math.round(Timeline.MIN_SPLIT_SECONDS * rate);
    const delta = Math.round(deltaSeconds * rate);
    if (edge === ClipTrim.EDGES.START) {
      const inSample = Math.max(0, Math.min(from.outSample - minSamples, from.inSample + delta));
      return { inSample, outSample: from.outSample };
    }
    const outSample = Math.min(seg.origin.length, Math.max(from.inSample + minSamples, from.outSample + delta));
    return { inSample: from.inSample, outSample };
  }
}

/** 롤링 계산 — 경계를 deltaSeconds만큼 옮길 때 앞 클립의 새 끝, 뒤 클립의 새 시작(샘플).
 *  두 클립 모두 원본 범위 안, 최소 길이 이상이 되도록 옮길 수 있는 만큼만 옮깁니다. */
export class ClipRoll {
  static range(left, right, deltaSeconds) {
    const min = Timeline.MIN_SPLIT_SECONDS;
    const lo = Math.max(
      -((left.outSample - left.inSample) / left.origin.sampleRate - min), // 앞 클립이 너무 짧아지지 않게
      -(right.inSample / right.origin.sampleRate) // 뒤 클립 원본 앞쪽 끝까지
    );
    const hi = Math.min(
      (left.origin.length - left.outSample) / left.origin.sampleRate, // 앞 클립 원본 뒤쪽 끝까지
      (right.outSample - right.inSample) / right.origin.sampleRate - min // 뒤 클립이 너무 짧아지지 않게
    );
    const d = Math.max(lo, Math.min(hi, deltaSeconds));
    return {
      leftOut: left.outSample + Math.round(d * left.origin.sampleRate),
      rightIn: right.inSample + Math.round(d * right.origin.sampleRate),
      deltaSeconds: d,
    };
  }
}

/** 미리듣기 재생기 — 한 번에 하나의 AudioBufferSourceNode만 재생합니다. */
export class PreviewPlayer {
  #source = null;
  #meter = null;
  #startedAt = 0;
  #buffer = null;

  get isActive() {
    return this.#source !== null;
  }

  get buffer() {
    return this.#buffer;
  }

  /** 데시벨 미터(재생하는 소리를 함께 측정). 처음 쓸 때 만듭니다. */
  get meter() {
    if (!this.#meter) {
      const ctx = AudioEngine.context;
      if (ctx) this.#meter = new LevelMeter(ctx);
    }
    return this.#meter;
  }

  /** 재생 시작 후 흐른 시간(초). */
  get elapsedSeconds() {
    return AudioEngine.context.currentTime - this.#startedAt;
  }

  play(buffer, offsetSeconds) {
    if (!buffer || buffer.duration <= 0) return false;
    this.stop();
    AudioEngine.unlock(); // 휴대폰(특히 아이폰 무음 스위치·탭 전에 만든 AudioContext)에서도 들리게
    const ctx = AudioEngine.context;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    this.meter?.listen(source, buffer.numberOfChannels);
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

  /** state.cursor가 있으면 드래그하는 동안 화면 전체 마우스 모양을 그것으로(예: 트리밍 중 ↔). */
  constructor(state, { onMove, onEnd }) {
    this.state = state;
    if (state.cursor) document.body.style.cursor = state.cursor;
    this.#onMove = (e) => onMove(e, this.state);
    this.#onEnd = (e) => {
      this.dispose();
      onEnd?.(e, this.state);
    };
    window.addEventListener("mousemove", this.#onMove);
    window.addEventListener("mouseup", this.#onEnd);
  }

  dispose() {
    if (this.state.cursor) document.body.style.cursor = "";
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
