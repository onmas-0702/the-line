"use client";

// 데시벨 미터 — 콘텐츠 제작의 트랙 오른편에 L/R 두 줄로, 미리듣기 소리의 크기(dBFS)를 보여 줍니다.
//   MeterScale       — 눈금(6 … -50, -∞)과 dB ↔ 높이 비율. 위로 갈수록 초록 → 노랑 → 빨강
//   LevelMeter       — AudioContext에 붙는 측정기(채널마다 AnalyserNode). 재생기가 소리를 여기로도 보냅니다
//   MeterBallistics  — 막대는 부드럽게 내려가고, 최고점 표시는 잠깐 머물렀다 내려가게(보기 편한 움직임)

export class MeterScale {
  static TICKS = [0, -6, -12, -24, -48];
  static FLOOR_DB = -60; // 이보다 작으면 -∞(맨 아래)
  static TOP_DB = 3;
  // 큰 소리 쪽(위)을 넓게 — [dB, 높이 비율] 기준점 사이를 직선으로 잇습니다.
  static #POINTS = [
    [3, 1],
    [0, 0.92],
    [-6, 0.78],
    [-12, 0.63],
    [-24, 0.42],
    [-48, 0.1],
    [-60, 0],
  ];

  /** dB → 0(맨 아래)~1(맨 위). */
  static fraction(db) {
    if (!Number.isFinite(db) || db <= MeterScale.FLOOR_DB) return 0;
    if (db >= MeterScale.TOP_DB) return 1;
    const pts = MeterScale.#POINTS;
    for (let i = 0; i < pts.length - 1; i++) {
      const [hiDb, hiF] = pts[i];
      const [loDb, loF] = pts[i + 1];
      if (db <= hiDb && db >= loDb) return loF + ((db - loDb) / (hiDb - loDb)) * (hiF - loF);
    }
    return 0;
  }

  /** 막대 색 띠(아래 → 위) — 화면의 차분한 색에 맞춘 세이지 초록 → 호박색 → 산호빛 빨강. [비율, 색] */
  static colorStops() {
    return [
      [0, "#8cc5a0"],
      [MeterScale.fraction(-18), "#5fae80"],
      [MeterScale.fraction(-9), "#e2b55a"],
      [MeterScale.fraction(-3), "#e8875a"],
      [MeterScale.fraction(0), "#e0554a"],
      [1, "#d9433b"],
    ];
  }

  /** 위쪽 숫자 표시 — "−∞", "−8", "+1". */
  static readout(db) {
    if (!Number.isFinite(db) || db <= MeterScale.FLOOR_DB) return "−∞";
    const rounded = Math.round(db);
    if (rounded > 0) return `+${rounded}`;
    return rounded === 0 ? "0" : `−${Math.abs(rounded)}`;
  }

  static isClipping(db) {
    return db > 0;
  }

  static tickLabel(db) {
    return db === 0 ? "0" : `−${Math.abs(db)}`;
  }
}

export class LevelMeter {
  static FFT_SIZE = 2048;

  #ctx;
  #splitter;
  #analysers;
  #data;

  constructor(ctx) {
    this.#ctx = ctx;
    this.#splitter = ctx.createChannelSplitter(2);
    this.#analysers = [ctx.createAnalyser(), ctx.createAnalyser()];
    for (const [i, analyser] of this.#analysers.entries()) {
      analyser.fftSize = LevelMeter.FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      this.#splitter.connect(analyser, i);
    }
    this.#data = new Float32Array(LevelMeter.FFT_SIZE);
  }

  /** 재생할 소리를 측정기에도 연결합니다(모노면 L/R 모두에). 측정기는 스피커로 소리를 내보내지 않습니다. */
  listen(source, channelCount) {
    if (channelCount === 1) {
      for (const analyser of this.#analysers) source.connect(analyser);
    } else {
      source.connect(this.#splitter);
    }
  }

  /** 지금 L/R 최고 크기(dBFS). 조용하면 -Infinity. */
  read() {
    return this.#analysers.map((analyser) => {
      analyser.getFloatTimeDomainData(this.#data);
      let peak = 0;
      for (let i = 0; i < this.#data.length; i++) {
        const v = Math.abs(this.#data[i]);
        if (v > peak) peak = v;
      }
      return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    });
  }
}

export class MeterBallistics {
  static FALL_DB_PER_SECOND = 24; // 막대가 내려가는 빠르기
  static HOLD_SECONDS = 1.2; // 최고점 표시가 머무는 시간
  static PEAK_FALL_DB_PER_SECOND = 12;

  constructor(channels = 2) {
    this.levels = new Array(channels).fill(-Infinity);
    this.peaks = new Array(channels).fill(-Infinity);
    this.holds = new Array(channels).fill(0);
  }

  /** 새로 읽은 dB 값들과 지난 프레임 이후 흐른 시간(초)으로 막대·최고점을 갱신합니다. */
  update(readings, dt) {
    readings.forEach((db, i) => {
      const fallen = this.levels[i] - MeterBallistics.FALL_DB_PER_SECOND * dt;
      this.levels[i] = Math.max(db, Number.isFinite(fallen) ? fallen : -Infinity);
      if (db >= this.peaks[i]) {
        this.peaks[i] = db;
        this.holds[i] = MeterBallistics.HOLD_SECONDS;
      } else if (this.holds[i] > 0) {
        this.holds[i] -= dt;
      } else {
        this.peaks[i] -= MeterBallistics.PEAK_FALL_DB_PER_SECOND * dt;
      }
    });
  }

  /** 소리가 다 내려가 더 그릴 게 없는지. */
  get isSilent() {
    return this.levels.every((db) => db <= MeterScale.FLOOR_DB) && this.peaks.every((db) => db <= MeterScale.FLOOR_DB);
  }
}
