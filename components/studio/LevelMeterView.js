"use client";

// 트랙 오른편의 데시벨 미터 — 스튜디오의 밝은 카드 모양에 맞춘 L/R 두 줄의 둥근 막대.
// 위쪽 숫자는 지금 가장 큰 소리(dB), 막대 위 작은 점은 최고점(잠깐 머물렀다 내려감).
// 위로 갈수록 초록 → 호박색 → 붉은색. 미리듣기 중에만 움직이고, 멈추면 천천히 내려앉습니다.
// 계산은 lib/levelMeter.js, 여기서는 그리기만 합니다(매 프레임 React 렌더 없이 canvas와 글자만 갱신).

import { useEffect, useRef } from "react";
import { MeterBallistics, MeterScale } from "@/lib/levelMeter";

const BAR_WIDTH = 7;
const BAR_GAP = 5;
const CANVAS_WIDTH = BAR_WIDTH * 2 + BAR_GAP;

export default function LevelMeterView({ getMeter, active }) {
  const canvasRef = useRef(null);
  const readoutRef = useRef(null);
  const ballisticsRef = useRef(null);

  useEffect(() => {
    if (!ballisticsRef.current) ballisticsRef.current = new MeterBallistics(2);
    const ballistics = ballisticsRef.current;
    let raf = 0;
    let last = performance.now();

    function paint() {
      draw(canvasRef.current, ballistics);
      const peak = Math.max(...ballistics.peaks);
      const el = readoutRef.current;
      if (el) {
        el.textContent = MeterScale.readout(peak);
        el.dataset.clip = MeterScale.isClipping(peak) ? "true" : "false";
      }
    }

    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const meter = active ? getMeter() : null;
      ballistics.update(meter ? meter.read() : [-Infinity, -Infinity], dt);
      paint();
      if (active || !ballistics.isSilent) raf = requestAnimationFrame(frame);
    }

    paint();
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, getMeter]);

  return (
    <div
      className="flex w-[58px] shrink-0 flex-col items-center rounded-xl border border-stone-200 bg-white px-1.5 pb-2 pt-1.5 shadow-sm"
      aria-label="데시벨 미터"
    >
      <span className="text-[9px] font-medium uppercase tracking-wider text-stone-400">dB</span>
      <span
        ref={readoutRef}
        className="mt-0.5 h-4 text-[11px] font-semibold tabular-nums leading-4 text-night-700 data-[clip=true]:text-red-500"
      >
        −∞
      </span>

      <div className="relative mt-1.5 flex min-h-0 w-full flex-1 justify-center gap-1">
        <canvas ref={canvasRef} className="h-full shrink-0" style={{ width: CANVAS_WIDTH }} />
        {/* 눈금 — 막대 오른쪽에 아주 작게 */}
        <div className="relative w-4 shrink-0">
          {MeterScale.TICKS.map((db) => (
            <span
              key={db}
              className="absolute left-0 -translate-y-1/2 text-[8px] tabular-nums leading-none text-stone-400"
              style={{ top: `${(1 - MeterScale.fraction(db)) * 100}%` }}
            >
              {MeterScale.tickLabel(db)}
            </span>
          ))}
        </div>
      </div>

      {/* 막대 줄과 같은 배치(막대 폭 + 눈금 자리)라서 L/R이 막대 바로 아래에 옵니다. */}
      <div className="mt-1.5 flex w-full justify-center gap-1 text-[9px] font-medium leading-none text-stone-400">
        <div className="flex shrink-0 justify-between" style={{ width: CANVAS_WIDTH }}>
          <span className="text-center" style={{ width: BAR_WIDTH }}>L</span>
          <span className="text-center" style={{ width: BAR_WIDTH }}>R</span>
        </div>
        <div className="w-4 shrink-0" />
      </div>
    </div>
  );
}

/** 둥근 막대 두 개 + 아주 옅은 눈금선 + 최고점 점. */
function draw(canvas, ballistics) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const width = CANVAS_WIDTH;
  const height = canvas.clientHeight;
  if (!height) return;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);

  const gradient = g.createLinearGradient(0, height, 0, 0);
  for (const [at, color] of MeterScale.colorStops()) gradient.addColorStop(at, color);
  const radius = BAR_WIDTH / 2;

  for (let i = 0; i < 2; i++) {
    const x = i * (BAR_WIDTH + BAR_GAP);
    // 빈 홈
    g.fillStyle = "#f1efec";
    pill(g, x, 0, BAR_WIDTH, height, radius);
    // 눈금선(홈 안에만, 아주 옅게)
    g.fillStyle = "rgba(120,113,108,0.12)";
    for (const db of MeterScale.TICKS) {
      g.fillRect(x + 1, Math.round((1 - MeterScale.fraction(db)) * height), BAR_WIDTH - 2, 1);
    }
    // 지금 크기 — 아래부터 채우고, 색은 높이에 맞는 띠
    const levelH = MeterScale.fraction(ballistics.levels[i]) * height;
    if (levelH > 0.5) {
      g.fillStyle = gradient;
      pill(g, x, height - levelH, BAR_WIDTH, levelH, Math.min(radius, levelH / 2));
    }
    // 최고점 — 작은 점
    const peakF = MeterScale.fraction(ballistics.peaks[i]);
    if (peakF > 0) {
      const y = Math.max(radius, height - peakF * height);
      g.fillStyle = MeterScale.isClipping(ballistics.peaks[i]) ? "#e0554a" : "#2f3a6b";
      g.beginPath();
      g.arc(x + radius, y, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function pill(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
  g.fill();
}
