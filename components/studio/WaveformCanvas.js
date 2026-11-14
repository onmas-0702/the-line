"use client";

// 클립 파형 — PeakMap에서 [startSample, endSample) 구간을 상자 폭에 꼭 맞게 그립니다.
// 상자의 왼쪽 끝 = 구간 시작, 오른쪽 끝 = 구간 끝이라서, 파형의 어느 지점을 눌러도 그 시간이
// 정확히 그 픽셀입니다(예전 막대 파형은 여백·간격 때문에 위치가 조금씩 어긋났어요).
// 색은 className의 글자색(text-…)을 그대로 씁니다.
// 높이는 볼륨(gain)에 비례합니다 — 원래 크기(0%)일 때 상자 높이의 절반까지, +100%일 때 꽉 차고,
// −100%(무음)이면 바닥의 얇은 선만 남습니다. 볼륨 손잡이의 위치(가운데 = 0%)와 같은 척도예요.

import { useEffect, useRef } from "react";
import { ClipGain } from "@/lib/audio";

const BAR_PX = 2; // 기둥 폭(CSS px)
const GAP_PX = 1; // 기둥 사이
const MAX_CANVAS_PX = 16000; // 브라우저 캔버스 한계 안으로

export default function WaveformCanvas({ peaks, startSample, endSample, gain = 1, className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return undefined;

    function draw() {
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (cssWidth <= 0 || cssHeight <= 0) return;
      const scale = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_PX / cssWidth);
      canvas.width = Math.max(1, Math.round(cssWidth * scale));
      canvas.height = Math.max(1, Math.round(cssHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.fillStyle = getComputedStyle(canvas).color;

      const step = BAR_PX + GAP_PX;
      const columns = Math.max(1, Math.floor(cssWidth / step));
      const levels = peaks.columns(startSample, endSample, columns);
      const colWidth = cssWidth / columns; // 남는 폭 없이 정확히 나눠 그림
      for (let c = 0; c < columns; c++) {
        const h = Math.max(1, Math.min(1, (levels[c] * gain) / ClipGain.MAX) * cssHeight);
        ctx.fillRect(c * colWidth, cssHeight - h, Math.max(1, colWidth - GAP_PX), h);
      }
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, startSample, endSample, gain, className]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />;
}
