"use client";

// 잘라낼 위치 고르기 — 원본 위에 규격 비율의 틀(기본: 휴대폰 세로 1170×2532)을 띄우고, 틀을 끌거나 아래 막대로
// 옮겨 잘라낼 부분을 고릅니다. 틀 밖은 어둡게 보여요. 계산은 ImageSpec.cropRect·CropFocus가 합니다.
// 갤러리 모바일 배경, 콘텐츠 배경이미지(정사각형)가 함께 씁니다(spec·label·hint로 구분).
// 틀은 손을 떼는 순간 onChange(focus)로 알려 줍니다(그때 배경이미지를 다시 자름).

import { useRef, useState } from "react";
import { GalleryUpload } from "@/lib/gallery";
import { CropFocus } from "@/lib/imageSpec";

export default function WallpaperFramePicker({
  imageUrl,
  width,
  height,
  focus = CropFocus.CENTER,
  onChange,
  disabled = false,
  spec = GalleryUpload.WALLPAPER,
  label = "모바일 배경",
  hint = "흰 틀을 끌어 휴대폰 배경으로 쓸 부분을 골라 주세요.",
}) {
  const boxRef = useRef(null);
  const dragRef = useRef(null);
  const [draft, setDraft] = useState(null); // 끄는 중인 위치(손을 떼면 null)
  const current = draft || focus;
  const crop = spec.cropRect(width, height, current);
  // 틀이 움직일 수 있는 방향 — 가로 사진은 좌우, 세로로 긴 사진은 위아래
  const horizontal = crop.width < width;
  const vertical = crop.height < height;
  const pct = (v, total) => `${(v / total) * 100}%`;

  function focusFromDrag(event) {
    const drag = dragRef.current;
    const rect = boxRef.current.getBoundingClientRect();
    const scale = width / rect.width; // 화면 px → 원본 px
    return drag.start.shiftedBy({ dx: (event.clientX - drag.x) * scale, dy: (event.clientY - drag.y) * scale, width, height, crop });
  }

  function onPointerDown(event) {
    if (disabled || (!horizontal && !vertical)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, start: current };
    setDraft(current);
  }

  function onPointerMove(event) {
    if (!dragRef.current) return;
    setDraft(focusFromDrag(event));
  }

  function onPointerUp(event) {
    if (!dragRef.current) return;
    const next = focusFromDrag(event);
    dragRef.current = null;
    setDraft(null);
    onChange?.(next);
  }

  const axisValue = horizontal ? current.x : current.y;

  return (
    <div className="space-y-2">
      <div
        ref={boxRef}
        className={`relative w-full touch-none select-none overflow-hidden rounded-xl bg-stone-900 ${disabled ? "opacity-60" : ""}`}
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        {/* 틀 — 바깥은 큰 그림자로 어둡게 */}
        <div
          className={`absolute rounded-md border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ${
            horizontal || vertical ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          style={{ left: pct(crop.x, width), top: pct(crop.y, height), width: pct(crop.width, width), height: pct(crop.height, height) }}
        >
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white">
            {label}
          </span>
        </div>
      </div>
      {horizontal || vertical ? (
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[11px] text-stone-400">{horizontal ? "왼쪽" : "위"}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={axisValue}
            disabled={disabled}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDraft(horizontal ? current.withX(v) : current.withY(v));
            }}
            onPointerUp={(e) => {
              const v = Number(e.currentTarget.value);
              setDraft(null);
              onChange?.(horizontal ? focus.withX(v) : focus.withY(v));
            }}
            onKeyUp={(e) => {
              const v = Number(e.currentTarget.value);
              setDraft(null);
              onChange?.(horizontal ? focus.withX(v) : focus.withY(v));
            }}
            className="flex-1 accent-night-700"
            aria-label={`${label} 위치`}
          />
          <span className="w-10 shrink-0 text-right text-[11px] text-stone-400">{horizontal ? "오른쪽" : "아래"}</span>
        </div>
      ) : null}
      <p className="text-[11px] text-stone-400">{hint}</p>
    </div>
  );
}
