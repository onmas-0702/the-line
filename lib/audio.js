"use client";

// Real Web Audio helpers — replaces the old fake/simulated recording,
// upload, waveform and playback logic. Everything here operates on
// actual decoded PCM audio (AudioBuffer), not mock data.

let sharedCtx = null;

/** Lazily create (or resume) a single shared AudioContext for the page. */
export function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!sharedCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    sharedCtx = new Ctx();
  }
  if (sharedCtx.state === "suspended") {
    // Must be called from a user-gesture handler (click/tap) to succeed.
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

/** Promise-based decodeAudioData that works with both the old callback
 *  signature and the modern promise-based one. */
function decodeAudioData(ctx, arrayBuffer) {
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
export async function decodeBlobToBuffer(blob) {
  const ctx = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return decodeAudioData(ctx, arrayBuffer);
}

/** Fetch + decode audio from a URL (e.g. a background-music file already
 *  uploaded to Supabase Storage) into a real AudioBuffer. */
export async function decodeUrlToBuffer(url) {
  const ctx = getAudioContext();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`오디오 파일을 불러오지 못했습니다 (${response.status})`);
  const arrayBuffer = await response.arrayBuffer();
  return decodeAudioData(ctx, arrayBuffer);
}

/** Default seconds of background-music-only intro before the voice comes
 *  in, in the final mix and in its on-screen waveform. This is just the
 *  starting value — the user can drag the intro handle on the timeline to
 *  change it per-recording (see ClipTimeline's voiceOffsetSeconds prop). */
export const DEFAULT_VOICE_OFFSET_SECONDS = 3;

/** Pick a bar count proportional to a clip's duration (roughly constant
 *  bars-per-second), so a 3-second clip and a 3-minute clip render at the
 *  same visual bar density instead of both always having 48 bars. */
export function barsForDuration(durationSeconds, { perSecond = 8, min = 12, max = 500 } = {}) {
  const bars = Math.round((durationSeconds || 0) * perSecond);
  return Math.max(min, Math.min(max, bars));
}

/** Compute real waveform bar heights (0–100) from actual PCM sample data
 *  using per-bucket RMS, replacing the old pseudo-random generator. */
export function computeWaveformPeaks(buffer, barCount = 48) {
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
    const pct = Math.min(100, Math.max(12, Math.round(rms * 320)));
    peaks.push(pct);
  }
  return peaks;
}

/** Build a waveform bar array for a background-music buffer, tiled/trimmed
 *  to fill `totalSeconds` of timeline width — i.e. the same loop-and-trim
 *  behavior mixVoiceWithBackground() applies to the actual audio (the
 *  background now always starts at the very beginning and loops for the
 *  whole timeline), rendered as bars so the on-screen background track
 *  lines up with what plays. */
export function computeTiledWaveformPeaks(buffer, totalSeconds, barsPerLoop = 48) {
  if (!buffer || !buffer.duration || !totalSeconds || totalSeconds <= 0) return [];
  const loopPeaks = computeWaveformPeaks(buffer, barsPerLoop);
  const totalBars = Math.max(1, Math.round((totalSeconds / buffer.duration) * barsPerLoop));
  const tiled = [];
  for (let i = 0; i < totalBars; i++) {
    tiled.push(loopPeaks[i % barsPerLoop]);
  }
  return tiled;
}

/** 클립의 최대 절대 샘플 값(피크). 볼륨 정규화의 기준으로 씁니다. */
export function computePeakAmplitude(buffer) {
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

// 볼륨 슬라이더(수직 드래그)가 다루는 범위: 0(무음) ~ 2(200%), 1이 원래 크기.
export const MIN_CLIP_GAIN = 0;
export const MAX_CLIP_GAIN = 2;

/** 녹음/업로드 직후 클립에 자동으로 적용하는 "방송 표준" 기본 볼륨을 계산합니다.
 *  정식 방송 라우드니스 규격(EBU R128/-23 LUFS 등)까지는 아니고, 피크가 약
 *  -3dBFS(약 0.7)에 오도록 맞추는 단순 피크 정규화입니다 — 배경음악과 섞였을
 *  때 클리핑 없이 목소리가 또렷하게 들리도록 하는 실용적인 기본값이에요.
 *  이후 클립 안의 볼륨 슬라이더로 사용자가 다시 조정할 수 있습니다. */
export function computeBroadcastNormalizedGain(buffer, targetPeak = 0.7) {
  const peak = computePeakAmplitude(buffer);
  if (peak <= 0.0001) return 1; // 거의 무음인 클립은 노이즈만 증폭시키지 않도록 그대로 둡니다.
  const gain = targetPeak / peak;
  return Math.max(MIN_CLIP_GAIN, Math.min(MAX_CLIP_GAIN, gain));
}

/** 버퍼의 모든 샘플에 게인을 곱한 새 버퍼를 만듭니다(원본은 그대로 두는
 *  non-destructive 방식 — seg.buffer는 항상 원본이고, seg.gain만 바뀝니다). */
export function applyGain(buffer, gain) {
  if (gain === 1) return buffer;
  const ctx = getAudioContext();
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) {
      dst[i] = Math.max(-1, Math.min(1, src[i] * gain));
    }
  }
  return out;
}

/** Cut an AudioBuffer into [start, end) by fraction (0–1) of its length —
 *  the real equivalent of the old array-slicing sliceWaveform(). */
export function sliceAudioBuffer(buffer, startFraction, endFraction) {
  const ctx = getAudioContext();
  const totalSamples = buffer.length;
  const startSample = Math.max(0, Math.floor(totalSamples * startFraction));
  const endSample = Math.min(totalSamples, Math.floor(totalSamples * endFraction));
  const length = Math.max(1, endSample - startSample);
  const out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const dst = out.getChannelData(ch);
    dst.set(buffer.getChannelData(ch).subarray(startSample, startSample + length));
  }
  return out;
}

/** A silent buffer of the given duration — used to represent timeline gaps
 *  when building one continuous buffer for playback/export. */
export function createSilentBuffer(seconds, sampleRate, numberOfChannels = 1) {
  const ctx = getAudioContext();
  const length = Math.max(1, Math.round(seconds * sampleRate));
  return ctx.createBuffer(numberOfChannels, length, sampleRate);
}

/** Concatenate multiple AudioBuffers (same sample rate) into one. */
export function concatBuffers(buffers) {
  const ctx = getAudioContext();
  const usable = buffers.filter(Boolean);
  if (usable.length === 0) return ctx.createBuffer(1, 1, ctx.sampleRate);
  const sampleRate = usable[0].sampleRate;
  const numberOfChannels = Math.max(1, ...usable.map((b) => b.numberOfChannels));
  const totalLength = usable.reduce((sum, b) => sum + b.length, 0);
  const out = ctx.createBuffer(numberOfChannels, Math.max(1, totalLength), sampleRate);
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

/** 목소리(메시지)가 끝난 뒤, 배경음악만 이 시간(초) 동안 더 이어지면서
 *  서서히 사라지는 "꼬리" 구간의 길이. 배경음악이 반복 재생 중이더라도
 *  상관없이, 목소리가 끝나는 시점부터 이 길이만큼 결과물이 늘어나고 그
 *  구간 안에서만 배경음악이 0까지 줄어듭니다 — mixVoiceWithBackground
 *  안에서 "목소리가 끝나는 지점 이후 N초"로 계산합니다. */
export const BG_FADE_OUT_SECONDS = 3;

// 나레이션(목소리)이 시작되기 이 시간(초) 전부터 배경음악을 서서히 낮추기
// 시작해서, 목소리가 실제로 시작되는 순간엔 이미 낮아져 있도록 합니다 —
// 라디오에서 흔히 쓰는 "덕킹(ducking)" 전환입니다.
export const BG_DUCK_LEAD_SECONDS = 2;

// 나레이션이 나오는 동안 배경음악을 (사용자가 설정한) 볼륨의 몇 %로 낮출지
// (더킹 레벨) — 0.35면 설정 볼륨의 35%로, 즉 65% 줄어든다는 뜻입니다.
// 목소리가 끝난 뒤의 꼬리 페이드아웃도 이 낮아진 볼륨에서부터 시작해서
// 0으로 줄어듭니다(끝나자마자 다시 커졌다가 줄어드는 부자연스러움 방지).
export const BG_DUCK_LEVEL = 0.35;

/** Overlay a background-music buffer under a voice buffer at a fixed
 *  volume (0–1). The background starts playing immediately at the very
 *  beginning and loops for the whole result; the voice only joins in after
 *  `voiceOffsetSeconds` (default 3s), so the background plays alone as a
 *  short intro before the voice starts — the reverse of "background comes
 *  in under the voice". The background loops if shorter than needed, or is
 *  trimmed if longer.
 *
 *  Starting `duckLeadSeconds` before the voice comes in, the background
 *  ramps down to `duckLevel` of its normal volume (a simple automatic
 *  "ducking" transition), stays there for the whole time the voice is
 *  playing, and only AFTER the voice finishes does the output continue for
 *  an extra `fadeOutSeconds` of background-only audio that fades from that
 *  ducked level down to silence — so the fade always happens after the
 *  message ends, never overlapping its final seconds, regardless of how
 *  many loops the background took to get there. Output length =
 *  voiceOffsetSeconds + voice length + fadeOutSeconds. The voice track
 *  itself is left completely untouched (no fades applied to it). */
export function mixVoiceWithBackground(
  voiceBuffer,
  bgBuffer,
  bgVolume = 0.35,
  voiceOffsetSeconds = DEFAULT_VOICE_OFFSET_SECONDS,
  fadeOutSeconds = BG_FADE_OUT_SECONDS,
  duckLeadSeconds = BG_DUCK_LEAD_SECONDS,
  duckLevel = BG_DUCK_LEVEL
) {
  const ctx = getAudioContext();
  const sampleRate = voiceBuffer.sampleRate;
  const numberOfChannels = Math.max(voiceBuffer.numberOfChannels, bgBuffer.numberOfChannels, 1);
  const offsetSamples = Math.max(0, Math.round(voiceOffsetSeconds * sampleRate));
  const voiceEndSample = offsetSamples + voiceBuffer.length; // 목소리(메시지)가 끝나는 지점
  const fadeSamples = Math.max(0, Math.round(fadeOutSeconds * sampleRate));
  const length = voiceEndSample + fadeSamples; // 목소리가 끝난 뒤 배경음악 꼬리만큼 더 늘어남
  const duckLeadSamples = Math.max(0, Math.round(duckLeadSeconds * sampleRate));
  const duckStartSample = Math.max(0, offsetSamples - duckLeadSamples); // 인트로가 이보다 짧으면 처음부터 낮게 시작
  const duckRampSamples = Math.max(0, offsetSamples - duckStartSample);
  const out = ctx.createBuffer(numberOfChannels, Math.max(1, length), sampleRate);

  for (let ch = 0; ch < numberOfChannels; ch++) {
    const voiceData = ch < voiceBuffer.numberOfChannels ? voiceBuffer.getChannelData(ch) : voiceBuffer.getChannelData(0);
    const bgData = ch < bgBuffer.numberOfChannels ? bgBuffer.getChannelData(ch) : bgBuffer.getChannelData(0);
    const outData = out.getChannelData(ch);
    const bgLength = bgData.length;
    for (let i = 0; i < length; i++) {
      let bgSample = bgLength > 0 ? bgData[i % bgLength] * bgVolume : 0; // 배경음악은 처음부터 끝까지, 짧으면 반복 재생

      // 나레이션 시작 직전 구간에서 서서히 낮추고(덕킹), 나레이션이 나오는
      // 동안 + 끝난 직후(꼬리 구간 시작점)까지는 낮아진 상태를 유지합니다.
      let duckMultiplier;
      if (i < duckStartSample) {
        duckMultiplier = 1; // 아직 배경음악만 나오는 인트로 구간 — 원래 볼륨
      } else if (i < offsetSamples) {
        const t = duckRampSamples > 0 ? (i - duckStartSample) / duckRampSamples : 1;
        duckMultiplier = 1 - t * (1 - duckLevel); // 1 → duckLevel로 서서히 낮아짐
      } else {
        duckMultiplier = duckLevel; // 나레이션 중 (그리고 꼬리 페이드의 시작 볼륨)
      }
      bgSample *= duckMultiplier;

      if (fadeSamples > 0 && i >= voiceEndSample) {
        // 목소리가 끝난 뒤부터만, 덕킹된 볼륨을 기준으로 서서히 0까지 줄어듭니다
        // (목소리와 겹치지 않고, 끝나자마자 다시 커졌다 줄어드는 어색함도 없음).
        const intoFade = i - voiceEndSample;
        bgSample *= Math.max(0, 1 - intoFade / fadeSamples);
      }
      const voiceSample =
        i >= offsetSamples && i < voiceEndSample ? voiceData[i - offsetSamples] : 0; // 목소리는 offset~끝까지만 (페이드 없음)
      let mixed = voiceSample + bgSample;
      mixed = Math.max(-1, Math.min(1, mixed)); // simple clipping guard
      outData[i] = mixed;
    }
  }
  return out;
}

/** Encode a decoded AudioBuffer as a 16-bit PCM WAV Blob (no external
 *  encoder needed — this is what the final "업로드" export uses). */
export function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

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
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = [];
  for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

  let offset = 44;
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

/** mm:ss formatter for real (not fake) durations. */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Build one continuous AudioBuffer from timeline segments, inserting real
 *  silence for gap segments — used both for live preview playback in the
 *  editor and (skipping gaps) for the final exported mixdown. Each clip's
 *  own volume (seg.gain, set by the vertical volume handle / broadcast
 *  normalization) is applied here so every playback path — clip preview,
 *  timeline preview, final mix — hears the same result. */
export function buildContinuousBuffer(segments, { skipGaps = false } = {}) {
  const ctx = getAudioContext();
  const parts = [];
  for (const seg of segments) {
    if (seg.type === "clip" && seg.buffer) {
      parts.push(applyGain(seg.buffer, seg.gain ?? 1));
    } else if (seg.type === "gap" && !skipGaps) {
      const sampleRate = segments.find((s) => s.buffer)?.buffer?.sampleRate || ctx.sampleRate;
      parts.push(createSilentBuffer(seg.duration || 0, sampleRate));
    }
  }
  if (parts.length === 0) return null;
  return concatBuffers(parts);
}
