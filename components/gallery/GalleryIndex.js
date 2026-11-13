"use client";

// 갤러리 전체 보기(/gallery) — 공개된 이미지 모두(최신순). 누르면 크게 보기.

import GalleryGrid from "@/components/gallery/GalleryGrid";
import { useGalleryImages } from "@/components/gallery/useGallery";

export default function GalleryIndex() {
  const { images, isLoading, isUnavailable } = useGalleryImages();
  return (
    <div className="space-y-3 px-4 py-4">
      <div>
        <h1 className="text-base font-semibold text-stone-900">이미지 갤러리</h1>
        <p className="mt-0.5 text-xs text-stone-400">
          이미지를 누르면 크게 볼 수 있어요. 구독자는 원본·모바일 배경이미지로 받고 마이 갤러리에 담을 수 있어요.
        </p>
      </div>
      {isLoading ? (
        <p className="py-10 text-center text-sm text-stone-400">이미지를 불러오는 중…</p>
      ) : images.length === 0 ? (
        <p className="py-10 text-center text-sm text-stone-400">
          {isUnavailable ? "이미지 갤러리를 준비하고 있어요." : "아직 올라온 이미지가 없어요."}
        </p>
      ) : (
        <GalleryGrid images={images} />
      )}
    </div>
  );
}
