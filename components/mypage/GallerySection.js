"use client";

// 마이 페이지 → 갤러리 — 이미지 갤러리에서 "마이 갤러리"에 담아둔 이미지. 누르면 크게 보기에서
// 다시 원본·모바일 배경이미지로 받을 수 있고, X로 마이 갤러리에서 뺄 수 있어요.

import Link from "next/link";
import GalleryGrid from "@/components/gallery/GalleryGrid";
import { LoadState, useLoaded, useMyPageRepos } from "@/components/mypage/useMyPageData";
import { useViewer } from "@/components/ViewerProvider";
import { GalleryPaths } from "@/lib/gallery";

export default function GallerySection() {
  const viewer = useViewer();
  const repos = useMyPageRepos();
  const { result, isLoading, setResult } = useLoaded(() => repos.myGallery.listMine(viewer.userId), [repos, viewer.userId]);
  const images = result?.images || [];

  async function remove(image) {
    const res = await repos.myGallery.set({ imageId: image.id, userId: viewer.userId, saved: false });
    if (!res.ok) return;
    setResult((prev) => ({ ...prev, images: prev.images.filter((i) => i.id !== image.id) }));
  }

  return (
    <LoadState
      isLoading={isLoading}
      result={result}
      empty={
        images.length === 0 ? (
          <>
            아직 담아둔 이미지가 없어요.{" "}
            <Link href={GalleryPaths.INDEX} className="font-medium text-night-700 hover:underline">
              이미지 갤러리 둘러보기
            </Link>
          </>
        ) : null
      }
    >
      <GalleryGrid images={images} onRemove={remove} />
    </LoadState>
  );
}
