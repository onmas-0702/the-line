"use client";

// 갤러리 썸네일 격자 — 메인 하단, 갤러리 전체 보기, 마이 갤러리, 크게 보기 아래 "다른 이미지"가
// 함께 씁니다. 썸네일은 오디오 메시지 썸네일과 같은 정사각형(1:1)·같은 모서리입니다.
// size: "md"(휴대폰 한 줄 2개, 넓은 화면 5개) | "sm"(한 줄 4개, 작은 썸네일).

import Link from "next/link";
import { X } from "lucide-react";

export default function GalleryGrid({ images, size = "md", currentId = null, onRemove = null }) {
  const columns = size === "sm" ? "grid-cols-4 gap-1.5" : "grid-cols-2 gap-2.5 sm:grid-cols-5";
  return (
    <ul className={`grid ${columns}`}>
      {images.map((image) => {
        const isCurrent = image.id === currentId;
        return (
          <li key={image.id} className="relative">
            {/* 링크에는 둥근 모서리 클래스를 두지 않습니다 — globals.css의 "버튼 별빛"(둥근 링크를
                버튼처럼 파랗게 칠함)이 사진 썸네일에 걸리지 않게, 사진·모서리는 안쪽 상자에 둡니다. */}
            <Link
              href={image.path}
              scroll
              aria-label={image.displayTitle}
              aria-current={isCurrent ? "page" : undefined}
              className="group block"
            >
              <span
                className={`block aspect-square overflow-hidden rounded-xl bg-stone-200 bg-cover bg-center transition group-hover:brightness-95 group-active:brightness-90 ${
                  isCurrent ? "ring-2 ring-night-700 ring-offset-2 ring-offset-stone-50" : ""
                }`}
                style={{ backgroundImage: `url(${image.thumbUrl})` }}
              />
            </Link>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(image)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"
                aria-label={`${image.displayTitle} 마이 갤러리에서 빼기`}
              >
                <X size={13} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
