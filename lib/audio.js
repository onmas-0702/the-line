"use client";

// Real Web Audio helpers — replaces the old fake/simulated recording,
// upload, waveform and playback logic. Everything here operates on
// actual decoded PCM audio (AudioBuffer), not mock data.
//
// 역할별로 클래스로 나눠져 있습니다:
//   AudioEngine      — 페이지 전체가 공유하는 AudioContext + 디코딩
//   AudioBufferOps   — 버퍼 자르기/이어붙이기/게인 등 순수 버퍼 연산
//   WaveformAnalyzer — 화면용 파형 막대/피크 계산
//   PeakMap          — 편집 타임라인 파형용 촘촘한 음량 지도(확대·트리밍해도 다시 계산 안 함)
//   BackgroundMixer  — 목소리 + 배경음악 믹싱(인트로·더킹·페이드아웃)
//   WavEncoder       — AudioBuffer → WAV Blob
//   TimeFormat       — mm:ss / 0:00.00 표시

import { MusicArrangement } from "@/lib/musicArrangement";

/** 볼륨 슬라이더(수직 드래그)가 다루는 범위: 0(무음) ~ 2(200%), 1이 원래 크기.
 *  화면에는 원래 크기를 0%로 두고 위로 +5%씩(최대 +100%), 아래로 -5%씩(최소 -100% = 무음) 보여줍니다.
 *  오디오 트랙 클립과 배경음악 트랙이 같은 척도·같은 표시를 씁니다. */
export class ClipGain {
  static MIN = 0;
  static MAX = 2;
  static DEFAULT = 1;
  static STEP = 0.05; // 5%

  /** 게인 → 화면 표시. 1 → "0%", 1.15 → "+15%", 0.8 → "-20%". */
  static label(gain) {
    const percent = Math.round((ClipGain.clamp(gain) - ClipGain.DEFAULT) * 100);
    if (percent === 0) return "0%";
    return `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`;
  }

  static clamp(gain) {
    return Math.max(ClipGain.MIN, Math.min(ClipGain.MAX, gain));
  }

  /** 세로 슬라이더 안의 포인터 위치 → 게인. 위쪽일수록 커지고(→MAX), 아래쪽일수록 작아집니다(→MIN).
   *  5% 단위로 딱딱 맞춰집니다. */
  static fromPointer(clientY, rectTop, rectHeight) {
    const fraction = 1 - Math.max(0, Math.min(1, (clientY - rectTop) / (rectHeight || 1)));
    const steps = Math.round((fraction * ClipGain.MAX) / ClipGain.STEP);
    return ClipGain.clamp(Math.round(steps * ClipGain.STEP * 100) / 100);
  }

  /** 게인 → 슬라이더 손잡이의 top(%) 위치. */
  static handleTopPercent(gain) {
    return (1 - Math.min(1, gain / ClipGain.MAX)) * 100;
  }
}

/** 아주 짧은 무음 WAV(휴대폰 소리 잠금 풀기용). */
class SilentAudio {
  static #uri = null;

  static dataUri() {
    if (SilentAudio.#uri) return SilentAudio.#uri;
    const sampleRate = 8000;
    const samples = 800; // 0.1초
    const bytes = new Uint8Array(44 + samples);
    const view = new DataView(bytes.buffer);
    const text = (offset, str) => [...str].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, 36 + samples, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // 모노
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true); // 8비트
    text(36, "data");
    view.setUint32(40, samples, true);
    bytes.fill(128, 44); // 8비트 무음 = 128
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    SilentAudio.#uri = `data:audio/wav;base64,${btoa(binary)}`;
    return SilentAudio.#uri;
  }
}

/** Lazily-created single shared AudioContext for the page, plus decoding. */
export class AudioEngine {
  static #sharedCtx = null;

  /** Lazily create (or resume) the shared AudioContext. */
  static get context() {
    if (typeof window === "undefined") return null;
    if (!AudioEngine.#sharedCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      AudioEngine.#sharedCtx = new Ctx();
    }
    const ctx = AudioEngine.#sharedCtx;
    if (ctx.state !== "running" && ctx.state !== "closed") {
      // Must be called from a user-gesture handler (click/tap) to succeed.
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  static #silentEl = null;

  /** 휴대폰에서 소리가 나게 준비합니다 — 반드시 누르기(탭) 처리 안에서 부르세요.
   *  · 아이폰은 무음(벨소리) 스위치를 켜 두면 Web Audio 소리를 막습니다. 미디어 재생으로 알리고
   *    (navigator.audioSession, iOS 17+), 소리 없는 <audio>를 한 번 재생해 미디어 채널로 바꿉니다(이전 iOS).
   *  · 페이지를 열 때(탭 전) 만든 AudioContext는 멈춰 있어서, 탭 안에서 다시 깨웁니다.
   *  녹음 화면에서는 마이크가 켜지며 자동으로 바뀌어서 이 문제가 드러나지 않았습니다. */
  static unlock() {
    if (typeof window === "undefined") return;
    try {
      if (navigator.audioSession && navigator.audioSession.type !== "play-and-record") {
        navigator.audioSession.type = "playback";
      }
    } catch {
      // 지원하지 않는 브라우저
    }
    if (!AudioEngine.#silentEl) {
      const el = new Audio(SilentAudio.dataUri());
      el.setAttribute("playsinline", "");
      el.preload = "auto";
      AudioEngine.#silentEl = el;
    }
    AudioEngine.#silentEl.play().catch(() => {});
    const ctx = AudioEngine.context;
    ctx?.resume?.().catch(() => {});
  }

  /** 녹음 전 — unlock이 "재생만"으로 바꿔 둔 경우 브라우저 기본(마이크를 켜면 알아서 녹음 모드)으로 되돌립니다. */
  static prepareForRecording() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = "auto";
    } catch {
      // 지원하지 않는 브라우저
    }
  }

  static createBuffer(numberOfChannels, length, sampleRate) {
    return AudioEngine.context.createBuffer(numberOfChannels, length, sampleRate);
  }

  /** Promise-based decodeAudioData that works with both the old callback
   *  signature and the modern promise-based one. */
  static #decode(arrayBuffer) {
    const ctx = AudioEngine.context;
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = ctx.decodeAudioData(arrayBuffer, resolve, reject);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(resolve, reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /** Decode a Blob/File (recorded or uploaded audio) into a real AudioBuffer. */
  static async decodeBlob(blob) {
    return AudioEngine.#decode(await blob.arrayBuffer());
  }

  /** Fetch + decode audio from a URL (e.g. a background-music file already
   *  uploaded to Supabase Storage) into a real AudioBuffer. */
  static async decodeUrl(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`오디오 파일을 불러오지 못했습니다 (${response.status})`);
    return AudioEngine.#decode(await response.arrayBuffer());
  }
}

/** Pure AudioBuffer transformations. Originals are never mutated. */
export class AudioBufferOps {
  /** 버퍼의 모든 샘플에 게인을 곱한 새 버퍼를 만듭니다(원본은 그대로 두는
   *  non-destructive 방식 — seg.buffer는 항상 원본이고, seg.gain만 바뀝니다). */
  static applyGain(buffer, gain) {
    if (gain === 1) return buffer;
    const out = AudioEngine.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      for (let i = 0; i < src.length; i++) {
        dst[i] = Math.max(-1, Math.min(1, src[i] * gain));
      }
    }
    return out;
  }

  /** Cut an AudioBuffer into [start, end) by fraction (0–1) of its length. */
  static slice(buffer, startFraction, endFraction) {
    const totalSamples = buffer.length;
    const startSample = Math.max(0, Math.floor(totalSamples * startFraction));
    const endSample = Math.min(totalSamples, Math.floor(totalSamples * endFraction));
    const length = Math.max(1, endSample - startSample);
    const out = AudioEngine.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      out.getChannelData(ch).set(buffer.getChannelData(ch).subarray(startSample, startSample + length));
    }
    return out;
  }

  /** 샘플 번호 [startSample, endSample)로 정확히 잘라낸 새 버퍼 — 편집 타임라인의 자르기·트리밍은
   *  비율(fraction) 대신 이 샘플 번호를 써서, 앞 조각의 끝과 뒤 조각의 시작이 같은 샘플이 되게 합니다. */
  static sliceSamples(buffer, startSample, endSample) {
    const start = Math.max(0, Math.min(buffer.length, Math.round(startSample)));
    const end = Math.max(start, Math.min(buffer.length, Math.round(endSample)));
    const length = Math.max(1, end - start);
    const out = AudioEngine.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      out.getChannelData(ch).set(buffer.getChannelData(ch).subarray(start, start + length));
    }
    return out;
  }

  /** A silent buffer of the given duration — used to represent timeline gaps
   *  when building one continuous buffer for playback/export. */
  static silence(seconds, sampleRate, numberOfChannels = 1) {
    const length = Math.max(1, Math.round(seconds * sampleRate));
    return AudioEngine.createBuffer(numberOfChannels, length, sampleRate);
  }

  /** Concatenate multiple AudioBuffers (same sample rate) into one. */
  static concat(buffers) {
    const usable = buffers.filter(Boolean);
    if (usable.length === 0) return AudioEngine.createBuffer(1, 1, AudioEngine.context.sampleRate);
    const sampleRate = usable[0].sampleRate;
    const numberOfChannels = Math.max(1, ...usable.map((b) => b.numberOfChannels));
    const totalLength = usable.reduce((sum, b) => sum + b.length, 0);
    const out = AudioEngine.createBuffer(numberOfChannels, Math.max(1, totalLength), sampleRate);
    let offset = 0;
    for (const b of usable) {
      for (let ch = 0; ch < numberOfChannels; ch++) {
        const src = ch < b.numberOfChannels ? b.getChannelData(ch) : b.getChannelData(0);
        out.getChannelData(ch).set(src, offset);
      }
      offset += b.length;
    }
    return out;
  }

  /** 다채널 믹싱 시, 채널 수가 부족한 버퍼는 0번 채널을 재사용합니다. */
  static channelOrFirst(buffer, ch) {
    return ch < buffer.numberOfChannels ? buffer.getChannelData(ch) : buffer.getChannelData(0);
  }
}

/** Real waveform analysis from decoded PCM data (no pseudo-random bars). */
export class WaveformAnalyzer {
  /** Pick a bar count proportional to a clip's duration (roughly constant
   *  bars-per-second), so a 3-second clip and a 3-minute clip render at the
   *  same visual bar density instead of both always having 48 bars. */
  static barsForDuration(durationSeconds, { perSecond = 8, min = 12, max = 500 } = {}) {
    const bars = Math.round((durationSeconds || 0) * perSecond);
    return Math.max(min, Math.min(max, bars));
  }

  /** Waveform bar heights (0–100) using per-bucket RMS. */
  static peaks(buffer, barCount = 48) {
    const channelData = buffer.getChannelData(0);
    const total = channelData.length;
    if (total === 0) return new Array(barCount).fill(12);

    const samplesPerBar = Math.max(1, Math.floor(total / barCount));
    const peaks = [];
    for (let i = 0; i < barCount; i++) {
      const start = i * samplesPerBar;
      const end = i === barCount - 1 ? total : Math.min(total, start + samplesPerBar);
      let sumSquares = 0;
      let count = 0;
      for (let j = start; j < end; j++) {
        const v = channelData[j];
        sumSquares += v * v;
        count++;
      }
      const rms = count ? Math.sqrt(sumSquares / count) : 0;
      // Scale RMS (~0–1) up into the same 12–100 visual range the UI expects.
      peaks.push(Math.min(100, Math.max(12, Math.round(rms * 320))));
    }
    return peaks;
  }

  /** 클립 길이에 맞는 막대 개수로 파형을 계산합니다(클립 생성/자르기 공용). */
  static peaksForBuffer(buffer) {
    return WaveformAnalyzer.peaks(buffer, WaveformAnalyzer.barsForDuration(buffer.duration));
  }

  /** Build a waveform bar array for a background-music buffer, tiled/trimmed
   *  to fill `totalSeconds` of timeline width — the same loop-and-trim
   *  behavior BackgroundMixer applies to the actual audio, rendered as bars
   *  so the on-screen background track lines up with what plays. */
  static tiledPeaks(buffer, totalSeconds, barsPerLoop = 48) {
    if (!buffer || !buffer.duration || !totalSeconds || totalSeconds <= 0) return [];
    const loopPeaks = WaveformAnalyzer.peaks(buffer, barsPerLoop);
    const totalBars = Math.max(1, Math.round((totalSeconds / buffer.duration) * barsPerLoop));
    const tiled = [];
    for (let i = 0; i < totalBars; i++) {
      tiled.push(loopPeaks[i % barsPerLoop]);
    }
    return tiled;
  }

  /** 클립의 최대 절대 샘플 값(피크). 볼륨 정규화의 기준으로 씁니다. */
  static peakAmplitude(buffer) {
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    return peak;
  }

  /** "방송 표준" 기본 볼륨 — 피크가 약 -3dBFS(약 0.7)에 오도록 맞추는 단순 피크
   *  정규화입니다(EBU R128 같은 정식 라우드니스 규격은 아님). */
  static broadcastNormalizedGain(buffer, targetPeak = 0.7) {
    const peak = WaveformAnalyzer.peakAmplitude(buffer);
    if (peak <= 0.0001) return 1; // 거의 무음인 클립은 노이즈만 증폭시키지 않도록 그대로 둡니다.
    return ClipGain.clamp(targetPeak / peak);
  }
}

/** 편집 타임라인 파형용 음량 지도 — 원본 오디오를 1초에 BUCKETS_PER_SECOND 칸으로 나눠 칸마다
 *  RMS(평균 음량)를 한 번만 계산해 둡니다. 화면은 이 지도에서 [시작 샘플, 끝 샘플) 범위를 원하는
 *  픽셀 수만큼 다시 묶어 그리므로, 확대하거나 클립을 자르고 트리밍해도 원본을 다시 훑지 않고
 *  시간 위치가 정확히 맞는 파형을 그립니다. 자른 조각들은 같은 지도를 함께 씁니다. 불변. */
export class PeakMap {
  static BUCKETS_PER_SECOND = 200; // 5ms 한 칸

  constructor(levels, samplesPerBucket) {
    this.levels = levels; // Float32Array, 0~1
    this.samplesPerBucket = samplesPerBucket;
    Object.freeze(this);
  }

  static fromBuffer(buffer) {
    const samplesPerBucket = Math.max(1, Math.round(buffer.sampleRate / PeakMap.BUCKETS_PER_SECOND));
    const count = Math.max(1, Math.ceil(buffer.length / samplesPerBucket));
    const levels = new Float32Array(count);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) => buffer.getChannelData(ch));
    for (let b = 0; b < count; b++) {
      const start = b * samplesPerBucket;
      const end = Math.min(buffer.length, start + samplesPerBucket);
      let sum = 0;
      for (const data of channels) {
        for (let i = start; i < end; i++) sum += data[i] * data[i];
      }
      const n = (end - start) * channels.length;
      levels[b] = n ? Math.sqrt(sum / n) : 0;
    }
    return new PeakMap(levels, samplesPerBucket);
  }

  /** [startSample, endSample) 범위를 columns개 기둥으로 묶은 높이(0~1, 최소 0.04). */
  columns(startSample, endSample, columns) {
    const out = new Float32Array(Math.max(0, columns));
    const span = Math.max(1, endSample - startSample);
    for (let c = 0; c < columns; c++) {
      const from = Math.floor((startSample + (span * c) / columns) / this.samplesPerBucket);
      const to = Math.max(from + 1, Math.ceil((startSample + (span * (c + 1)) / columns) / this.samplesPerBucket));
      let level = 0;
      for (let b = from; b < to && b < this.levels.length; b++) {
        if (this.levels[b] > level) level = this.levels[b];
      }
      out[c] = Math.min(1, Math.max(0.04, level * 3.2)); // 예전 막대 파형과 같은 크기 감각(RMS × 3.2)
    }
    return out;
  }
}

/** 목소리 아래에 배경음악을 깝니다. 배경음악은 편집 타임라인에서 "클립"처럼 다룹니다:
 *   musicStartSeconds  — 타임라인에서 배경음악이 시작하는 곳(기본 0)
 *   musicOffsetSeconds — 곡의 어디서부터 틀지(앞부분 트리밍, 기본 0). 곡이 짧으면 반복해서 이어집니다.
 *   musicEndSeconds    — 배경음악이 끝나는 곳. null이면 자동 = 마지막 목소리가 끝난 뒤 FADE_OUT_SECONDS.
 *
 *  볼륨 흐름:
 *   1. 배경음악이 시작되고 DUCK_AFTER_SECONDS(3초) 동안은 원래 볼륨
 *   2. 그 뒤 DUCK_RAMP_SECONDS(1초)에 걸쳐 DUCK_LEVEL(35%)로 낮춤 — 목소리가 더 일찍 나오면 그때부터
 *   3. 목소리가 나오는 동안 낮은 볼륨 유지
 *   4. 배경음악 끝 FADE_OUT_SECONDS(3초) 동안 0까지 부드럽게 페이드아웃
 *  결과 길이 = max(목소리 끝, 배경음악 끝). 목소리 자체에는 페이드를 넣지 않습니다.
 *  levelAt()은 실제 믹싱과 같은 계산이라, 편집 타임라인의 배경음악 파형도 이 값으로 그립니다. */
export class BackgroundMixer {
  /** 배경음악만 먼저 나오는 인트로 기본 길이(초) — 타임라인의 하늘색 손잡이로 바꿀 수 있어요. */
  static DEFAULT_VOICE_OFFSET_SECONDS = 3;
  /** 배경음악 끝에서 0까지 줄어드는 길이(초). 자동 끝일 때는 목소리가 끝난 뒤의 "꼬리" 길이. */
  static FADE_OUT_SECONDS = 3;
  /** (예전 방식 — 배경음악 시작 몇 초 뒤 낮추기. 지금은 목소리 시작에 맞춰 낮추므로 쓰지 않음, 저장본 호환용) */
  static DUCK_AFTER_SECONDS = 3;
  /** 원래 볼륨 → 낮은 볼륨으로 내려가는 시간(초). 목소리가 시작되는 순간에 다 내려가도록, 그 2초 전부터 줄입니다. */
  static DUCK_RAMP_SECONDS = 2;
  /** 낮춘 볼륨 — 설정 볼륨의 몇 배인지(0.35 = 35%). */
  static DUCK_LEVEL = 0.35;
  /** 배경음악 클립의 최소 길이(초). */
  static MIN_MUSIC_SECONDS = 1;

  constructor({
    volume = 0.35,
    voiceOffsetSeconds = BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS,
    musicStartSeconds = 0,
    musicOffsetSeconds = 0,
    musicEndSeconds = null,
    musicPieces = null, // 편집된 배경음악(조각 목록) — 있으면 위 offset·end 대신 이 배치대로(lib/musicArrangement.js)
    fadeOutSeconds = BackgroundMixer.FADE_OUT_SECONDS,
    duckAfterSeconds = BackgroundMixer.DUCK_AFTER_SECONDS,
    duckRampSeconds = BackgroundMixer.DUCK_RAMP_SECONDS,
    duckLevel = BackgroundMixer.DUCK_LEVEL,
  } = {}) {
    this.volume = volume;
    this.voiceOffsetSeconds = voiceOffsetSeconds;
    this.musicStartSeconds = Math.max(0, musicStartSeconds || 0);
    this.musicOffsetSeconds = Math.max(0, musicOffsetSeconds || 0);
    this.musicEndSeconds = Number.isFinite(musicEndSeconds) ? musicEndSeconds : null;
    this.arrangement =
      Array.isArray(musicPieces) && musicPieces.length
        ? new MusicArrangement({ startSeconds: this.musicStartSeconds, pieces: musicPieces })
        : null;
    this.fadeOutSeconds = fadeOutSeconds;
    this.duckAfterSeconds = duckAfterSeconds;
    this.duckRampSeconds = duckRampSeconds;
    this.duckLevel = duckLevel;
  }

  /** AudioEditSettings(또는 같은 모양의 값) → 믹서. */
  static fromSettings({ musicVolume, voiceOffsetSeconds, musicClip = {} }) {
    return new BackgroundMixer({
      volume: musicVolume,
      voiceOffsetSeconds,
      musicStartSeconds: musicClip.startSeconds,
      musicOffsetSeconds: musicClip.offsetSeconds,
      musicEndSeconds: musicClip.endSeconds,
      musicPieces: musicClip.pieces,
    });
  }

  /** 배경음악이 끝나는 곳(초) — 직접 정했으면 그곳, 아니면 마지막 목소리 끝 + 페이드아웃. */
  endSeconds(voiceSeconds) {
    if (this.arrangement) return this.arrangement.endSeconds;
    if (this.musicEndSeconds !== null) {
      return Math.max(this.musicStartSeconds + BackgroundMixer.MIN_MUSIC_SECONDS, this.musicEndSeconds);
    }
    return this.voiceOffsetSeconds + voiceSeconds + this.fadeOutSeconds;
  }

  /** 믹스 전체 길이(초) — 목소리와 배경음악 중 늦게 끝나는 쪽까지. */
  totalSeconds(voiceSeconds) {
    return Math.max(this.voiceOffsetSeconds + voiceSeconds, this.endSeconds(voiceSeconds));
  }

  /** 다 낮아지는 시간(초) = 목소리(오디오 트랙)가 시작되는 순간. 오디오 트랙을 옮기면 함께 따라갑니다. */
  get duckEndSeconds() {
    return Math.max(this.musicStartSeconds, this.voiceOffsetSeconds);
  }

  /** 낮추기 시작하는 시간(초) — 목소리 시작 2초 전. 배경음악이 그보다 늦게 시작하면 배경음악 시작부터(그만큼 짧게). */
  get duckStartSeconds() {
    return Math.max(this.musicStartSeconds, this.duckEndSeconds - this.duckRampSeconds);
  }

  /** levelAt 결과를 바꾸는 값들을 한 줄로 — 같으면 시간별 볼륨이 같습니다(파형 다시 그리기 판단용). */
  levelKey(voiceSeconds) {
    return [this.musicStartSeconds, this.endSeconds(voiceSeconds), this.duckStartSeconds, this.duckEndSeconds, this.duckLevel, this.fadeOutSeconds].join("|");
  }

  /** seconds 시점의 배경음악 볼륨 배율(설정 볼륨 기준, 0~1). voiceSeconds: 목소리 전체 길이. */
  levelAt(seconds, voiceSeconds) {
    const end = this.endSeconds(voiceSeconds);
    if (seconds < this.musicStartSeconds || seconds >= end) return 0;
    const duckStart = this.duckStartSeconds;
    const duckEnd = this.duckEndSeconds;
    let level;
    if (seconds < duckStart) level = 1;
    else if (seconds < duckEnd) {
      const t = BackgroundMixer.#smooth((seconds - duckStart) / (duckEnd - duckStart));
      level = 1 - t * (1 - this.duckLevel);
    } else level = this.duckLevel;

    const fade = Math.min(this.fadeOutSeconds, end - this.musicStartSeconds);
    if (fade > 0 && seconds >= end - fade) {
      level *= 1 - BackgroundMixer.#smooth((seconds - (end - fade)) / fade); // 처음엔 천천히, 끝에서 다시 천천히 0으로
    }
    return level;
  }

  /** 타임라인 seconds 시점에 곡의 몇 초가 나오는지(반복 포함). */
  sourceSecondsAt(seconds, songSeconds) {
    if (!songSeconds) return 0;
    const t = seconds - this.musicStartSeconds + this.musicOffsetSeconds;
    return ((t % songSeconds) + songSeconds) % songSeconds;
  }

  /** 0→1을 부드러운 곡선으로(시작·끝이 완만). */
  static #smooth(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  /** 배경음악 트랙의 조각 배치 — 편집했으면 그 배치, 아니면 자동(반복 포함)을 조각으로 펼친 것. 화면 표시용. */
  arrangementFor(voiceSeconds, songSeconds) {
    if (this.arrangement) return this.arrangement;
    return MusicArrangement.fromLegacy({
      startSeconds: this.musicStartSeconds,
      offsetSeconds: this.musicOffsetSeconds,
      endSeconds: this.endSeconds(voiceSeconds),
      songSeconds,
    });
  }

  /** 조각 배치대로 곡을 깐 한 채널(볼륨 흐름 적용 전). 곡의 샘플레이트가 달라도 시간으로 맞춥니다. */
  static #renderPieces(layout, bgData, bgRate, sampleRate, length) {
    const out = new Float32Array(length);
    for (const entry of layout) {
      const from = Math.max(0, Math.round(entry.start * sampleRate));
      const to = Math.min(length, Math.round(entry.end * sampleRate));
      for (let i = from; i < to; i++) {
        const t = i / sampleRate;
        const j = Math.floor((entry.piece.offsetSeconds + (t - entry.start)) * bgRate);
        if (j < 0 || j >= bgData.length) continue;
        out[i] += bgData[j] * MusicArrangement.pieceGain(entry, t);
      }
    }
    return out;
  }

  mix(voiceBuffer, bgBuffer) {
    const sampleRate = voiceBuffer.sampleRate;
    const numberOfChannels = Math.max(voiceBuffer.numberOfChannels, bgBuffer.numberOfChannels, 1);
    const voiceSeconds = voiceBuffer.length / sampleRate;
    const offsetSamples = Math.max(0, Math.round(this.voiceOffsetSeconds * sampleRate));
    const voiceEndSample = offsetSamples + voiceBuffer.length;
    const length = Math.max(1, Math.round(this.totalSeconds(voiceSeconds) * sampleRate), voiceEndSample);
    const out = AudioEngine.createBuffer(numberOfChannels, length, sampleRate);

    // 볼륨 배율과 곡 안의 위치는 채널마다 같으므로 한 번만 계산해 둡니다.
    const gains = new Float32Array(length);
    for (let i = 0; i < length; i++) gains[i] = this.volume * this.levelAt(i / sampleRate, voiceSeconds);
    const bgRate = bgBuffer.sampleRate || sampleRate;
    const startSample = Math.round(this.musicStartSeconds * sampleRate);
    const offsetInSong = Math.round(this.musicOffsetSeconds * bgRate);

    const layout = this.arrangement?.layout || null;

    for (let ch = 0; ch < numberOfChannels; ch++) {
      const voiceData = AudioBufferOps.channelOrFirst(voiceBuffer, ch);
      const bgData = AudioBufferOps.channelOrFirst(bgBuffer, ch);
      const outData = out.getChannelData(ch);
      const bgLength = bgData.length;
      // 편집된 배경음악: 조각마다 곡의 그 부분을 깔고, 디졸브 구간은 두 조각을 엇갈려 섞습니다.
      const arranged = layout ? BackgroundMixer.#renderPieces(layout, bgData, bgRate, sampleRate, length) : null;
      for (let i = 0; i < length; i++) {
        let bgSample = 0;
        if (arranged) {
          bgSample = arranged[i] * gains[i];
        } else if (bgLength > 0 && gains[i] > 0) {
          const j = (((i - startSample + offsetInSong) % bgLength) + bgLength) % bgLength; // 짧으면 반복 재생
          bgSample = bgData[j] * gains[i];
        }
        const voiceSample = i >= offsetSamples && i < voiceEndSample ? voiceData[i - offsetSamples] : 0;
        outData[i] = Math.max(-1, Math.min(1, voiceSample + bgSample)); // simple clipping guard
      }
    }
    return out;
  }
}

/** Encode a decoded AudioBuffer as a 16-bit PCM WAV Blob (no external
 *  encoder needed — this is what the final "업로드" export uses). */
export class WavEncoder {
  static #HEADER_BYTES = 44;
  static #BYTES_PER_SAMPLE = 2;

  static encode(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const blockAlign = numChannels * WavEncoder.#BYTES_PER_SAMPLE;
    const dataSize = numFrames * blockAlign;
    const arrayBuffer = new ArrayBuffer(WavEncoder.#HEADER_BYTES + dataSize);
    const view = new DataView(arrayBuffer);

    WavEncoder.#writeHeader(view, { numChannels, sampleRate, blockAlign, dataSize });

    const channelData = [];
    for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

    let offset = WavEncoder.#HEADER_BYTES;
    for (let i = 0; i < numFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  static #writeHeader(view, { numChannels, sampleRate, blockAlign, dataSize }) {
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, WavEncoder.#BYTES_PER_SAMPLE * 8, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);
  }
}

export class TimeFormat {
  /** mm:ss formatter for real (not fake) durations. */
  static duration(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds || 0));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  /** 자르기·트리밍 위치처럼 정밀한 시간 — 1:02.35 (분:초.100분의1초). */
  static precise(totalSeconds) {
    const cs = Math.max(0, Math.round((totalSeconds || 0) * 100));
    const minutes = Math.floor(cs / 6000);
    const seconds = String(Math.floor((cs % 6000) / 100)).padStart(2, "0");
    const hundredths = String(cs % 100).padStart(2, "0");
    return `${minutes}:${seconds}.${hundredths}`;
  }
}
