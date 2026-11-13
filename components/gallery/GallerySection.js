"use client";

// 플랫폼 메인 하단 "이미지 갤러리" — 최근 이미지 썸네일(휴대폰 한 줄 2개). 누르면 크게 보기.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import GalleryGrid from "@/components/gallery/GalleryGrid";
import { useGalleryImages } from "@/components/gallery/useGallery";
import { GalleryPaths } from "@/lib/gallery";

const PREVIEW_COUNT = 6; // 휴대폰 한 줄 2개 × 3줄 — 나머지는 "전체 보기"에서

export default function GallerySection() {
  const { images, isLoading, isUnavailable } = useGalleryImages({ limit: PREVIEW_COUNT });

  return (
    <section className="px-4 py-4" aria-labelledby="gallery-heading">
      <div className="flex items-end justify-between">
        <div>
          <h2 id="gallery-heading" className="text-base font-semibold text-stone-900">
            이미지 갤러리
          </h2>
          <p className="mt-0.5 text-xs text-stone-400">구독자는 원본·모바일 배경이미지로 받을 수 있어요.</p>
        </div>
        {images.length > 0 && (
          <Link href={GalleryPaths.INDEX} className="flex items-center text-xs font-medium text-night-700 hover:underline">
            전체 보기 <ChevronRight size={14} />
          </Link>
        )}
      </div>
      <div className="mt-3">
        {isLoading ? (
          <p className="py-6 text-center text-xs text-stone-400">이미지를 불러오는 중…</p>
        ) : images.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 py-8 text-center text-xs text-stone-400">
            {isUnavailable ? "이미지 갤러리를 준비하고 있어요." : "곧 이미지가 올라와요."}
          </p>
        ) : (
          <GalleryGrid images={images} />
        )}
      </div>
    </section>
  );
}
