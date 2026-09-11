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
 *  to match `totalSeconds` of a voice track — i.e. the same loop-and-trim
 *  behavior mixVoiceWithBackground() applies to the actual audio, rendered
 *  as bars so the on-screen background track lines up with what plays. */
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

/** Overlay a background-music buffer under a voice buffer at a fixed
 *  volume (0–1). The background loops if shorter than the voice, or is
 *  trimmed if longer — the result always matches the voice's duration.
 *  This is plain constant-volume mixing (no ducking yet). */
export function mixVoiceWithBackground(voiceBuffer, bgBuffer, bgVolume = 0.35) {
  const ctx = getAudioContext();
  const sampleRate = voiceBuffer.sampleRate;
  const numberOfChannels = Math.max(voiceBuffer.numberOfChannels, bgBuffer.numberOfChannels, 1);
  const length = voiceBuffer.length;
  const out = ctx.createBuffer(numberOfChannels, Math.max(1, length), sampleRate);

  for (let ch = 0; ch < numberOfChannels; ch++) {
    const voiceData = ch < voiceBuffer.numberOfChannels ? voiceBuffer.getChannelData(ch) : voiceBuffer.getChannelData(0);
    const bgData = ch < bgBuffer.numberOfChannels ? bgBuffer.getChannelData(ch) : bgBuffer.getChannelData(0);
    const outData = out.getChannelData(ch);
    const bgLength = bgData.length;
    for (let i = 0; i < length; i++) {
      const bgSample = bgLength > 0 ? bgData[i % bgLength] : 0; // loop background to cover full voice length
      let mixed = voiceData[i] + bgSample * bgVolume;
      mixed = Math.max(-1, Math.min(1, mixed)); // simple clipping guard
      outData[i] = mixed;
    }
  }
  return out;
}

/** Encode a decoded AudioBuffer as a 16-bit PCM WAV Blob (no external
 *  encoder needed — this is what the final "믹싱하고 공유하기" export uses). */
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
 *  editor and (skipping gaps) for the final exported mixdown. */
export function buildContinuousBuffer(segments, { skipGaps = false } = {}) {
  const ctx = getAudioContext();
  const parts = [];
  for (const seg of segments) {
    if (seg.type === "clip" && seg.buffer) {
      parts.push(seg.buffer);
    } else if (seg.type === "gap" && !skipGaps) {
      const sampleRate = segments.find((s) => s.buffer)?.buffer?.sampleRate || ctx.sampleRate;
      parts.push(createSilentBuffer(seg.duration || 0, sampleRate));
    }
  }
  if (parts.length === 0) return null;
  return concatBuffers(parts);
}
