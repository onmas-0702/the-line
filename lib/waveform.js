// Deterministic pseudo-random waveform generator for the wireframe.
// Same seed (e.g. a clip id) always produces the same-looking waveform,
// so re-renders don't cause the bars to flicker/change.

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateWaveform(seedStr, barCount = 48) {
  const rand = mulberry32(hashString(String(seedStr)));
  const bars = [];
  let prev = 40;
  for (let i = 0; i < barCount; i++) {
    const delta = (rand() - 0.5) * 55;
    let v = prev + delta;
    v = Math.max(12, Math.min(100, v));
    bars.push(Math.round(v));
    prev = v;
  }
  return bars;
}

export function sliceWaveform(bars, fraction) {
  const splitIndex = Math.max(1, Math.min(bars.length - 1, Math.round(bars.length * fraction)));
  return [bars.slice(0, splitIndex), bars.slice(splitIndex)];
}
