"use client";

// Real Web Audio helpers — replaces the old fake/simulated recording,
// upload, waveform and playback logic. Everything here operates on
// actual decoded PCM audio (AudioBuffer), not mock data.
//
// 역할별로 클래스로 나눠져 있습니다:
//   AudioEngine      — 페이지 전체가 공유하는 AudioContext + 디코딩
//   AudioBufferOps   — 버퍼 자르기/이어붙이기/게인 등 순수 버퍼 연산
//   WaveformAnalyzer — 화면용 파형 막대/피크 계산
//   BackgroundMixer  — 목소리 + 배경음악 믹싱(인트로·더킹·페이드아웃)
//   WavEncoder       — AudioBuffer → WAV Blob
//   TimeFormat       — mm:ss 표시

/** 볼륨 슬라이더(수직 드래그)가 다루는 범위: 0(무음) ~ 2(200%), 1이 원래 크기. */
export class ClipGain {
  static MIN = 0;
  static MAX = 2;
  static DEFAULT = 1;

  static clamp(gain) {
    return Math.max(ClipGain.MIN, Math.min(ClipGain.MAX, gain));
  }

  /** 세로 슬라이더 안의 포인터 위치 → 게인. 위쪽일수록 커지고(→MAX),
   *  아래쪽일수록 작아집니다(→MIN). 소수 둘째 자리까지 반올림합니다. */
  static fromPointer(clientY, rectTop, rectHeight) {
    const fraction = 1 - Math.max(0, Math.min(1, (clientY - rectTop) / (rectHeight || 1)));
    return ClipGain.clamp(Math.round(fraction * ClipGain.MAX * 100) / 100);
  }

  /** 게인 → 슬라이더 손잡이의 top(%) 위치. */
  static handleTopPercent(gain) {
    return (1 - Math.min(1, gain / ClipGain.MAX)) * 100;
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
    if (ctx.state === "suspended") {
      // Must be called from a user-gesture handler (click/tap) to succeed.
      ctx.resume().catch(() => {});
    }
    return ctx;
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

/** Overlay a background-music buffer under a voice buffer.
 *
 *  The background starts immediately at the very beginning and loops for the
 *  whole result; the voice only joins in after `voiceOffsetSeconds`, so the
 *  background plays alone as a short intro. Starting `duckLeadSeconds` before
 *  the voice, the background ramps down to `duckLevel` of its volume
 *  ("ducking"), stays there while the voice plays, and only AFTER the voice
 *  finishes does the output continue for `fadeOutSeconds` of background-only
 *  audio fading from that ducked level to silence. Output length =
 *  voiceOffsetSeconds + voice length + fadeOutSeconds. The voice itself is
 *  left untouched (no fades applied to it). */
export class BackgroundMixer {
  /** Default seconds of background-only intro before the voice comes in —
   *  the user can drag the intro handle on the timeline to change it. */
  static DEFAULT_VOICE_OFFSET_SECONDS = 3;
  /** 목소리가 끝난 뒤 배경음악만 이어지며 0까지 줄어드는 "꼬리" 길이(초). */
  static FADE_OUT_SECONDS = 3;
  /** 나레이션 시작 이 시간(초) 전부터 배경음악을 서서히 낮춥니다(더킹). */
  static DUCK_LEAD_SECONDS = 2;
  /** 나레이션 중 배경음악을 설정 볼륨의 몇 %로 낮출지 — 0.35면 35%. */
  static DUCK_LEVEL = 0.35;

  constructor({
    volume = 0.35,
    voiceOffsetSeconds = BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS,
    fadeOutSeconds = BackgroundMixer.FADE_OUT_SECONDS,
    duckLeadSeconds = BackgroundMixer.DUCK_LEAD_SECONDS,
    duckLevel = BackgroundMixer.DUCK_LEVEL,
  } = {}) {
    this.volume = volume;
    this.voiceOffsetSeconds = voiceOffsetSeconds;
    this.fadeOutSeconds = fadeOutSeconds;
    this.duckLeadSeconds = duckLeadSeconds;
    this.duckLevel = duckLevel;
  }

  mix(voiceBuffer, bgBuffer) {
    const sampleRate = voiceBuffer.sampleRate;
    const numberOfChannels = Math.max(voiceBuffer.numberOfChannels, bgBuffer.numberOfChannels, 1);
    const offsetSamples = Math.max(0, Math.round(this.voiceOffsetSeconds * sampleRate));
    const voiceEndSample = offsetSamples + voiceBuffer.length; // 목소리(메시지)가 끝나는 지점
    const fadeSamples = Math.max(0, Math.round(this.fadeOutSeconds * sampleRate));
    const length = voiceEndSample + fadeSamples; // 목소리가 끝난 뒤 배경음악 꼬리만큼 더 늘어남
    const duckLeadSamples = Math.max(0, Math.round(this.duckLeadSeconds * sampleRate));
    const duckStartSample = Math.max(0, offsetSamples - duckLeadSamples); // 인트로가 이보다 짧으면 처음부터 낮게 시작
    const duckRampSamples = Math.max(0, offsetSamples - duckStartSample);
    const out = AudioEngine.createBuffer(numberOfChannels, Math.max(1, length), sampleRate);

    for (let ch = 0; ch < numberOfChannels; ch++) {
      const voiceData = AudioBufferOps.channelOrFirst(voiceBuffer, ch);
      const bgData = AudioBufferOps.channelOrFirst(bgBuffer, ch);
      const outData = out.getChannelData(ch);
      const bgLength = bgData.length;
      for (let i = 0; i < length; i++) {
        let bgSample = bgLength > 0 ? bgData[i % bgLength] * this.volume : 0; // 짧으면 반복 재생
        bgSample *= this.#duckMultiplier(i, duckStartSample, offsetSamples, duckRampSamples);

        if (fadeSamples > 0 && i >= voiceEndSample) {
          // 목소리가 끝난 뒤부터만, 덕킹된 볼륨을 기준으로 서서히 0까지 줄어듭니다.
          bgSample *= Math.max(0, 1 - (i - voiceEndSample) / fadeSamples);
        }
        const voiceSample =
          i >= offsetSamples && i < voiceEndSample ? voiceData[i - offsetSamples] : 0; // 목소리는 페이드 없음
        outData[i] = Math.max(-1, Math.min(1, voiceSample + bgSample)); // simple clipping guard
      }
    }
    return out;
  }

  /** 인트로 구간은 원래 볼륨(1), 나레이션 직전엔 1 → duckLevel로 서서히 낮추고,
   *  나레이션 중(그리고 꼬리 페이드의 시작점)에는 duckLevel을 유지합니다. */
  #duckMultiplier(i, duckStartSample, offsetSamples, duckRampSamples) {
    if (i < duckStartSample) return 1;
    if (i < offsetSamples) {
      const t = duckRampSamples > 0 ? (i - duckStartSample) / duckRampSamples : 1;
      return 1 - t * (1 - this.duckLevel);
    }
    return this.duckLevel;
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
}
