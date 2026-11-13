"use client";

// 갤러리 크게 보기(/gallery/{id}) — 고른 이미지를 크게 보여주고, 아래에 받기 버튼
// ("원본 다운로드" · "모바일 배경이미지")과 "마이 갤러리" 담기, 그 아래 다른 이미지를 작은
// 썸네일로 보여줍니다. 받기·담기는 구독자 전용(FeatureGate.Feature.GALLERY).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Download, Lock, Smartphone } from "lucide-react";
import GatePrompt from "@/components/common/GatePrompt";
import GalleryGrid from "@/components/gallery/GalleryGrid";
import { useGalleryImages, useGalleryRepos } from "@/components/gallery/useGallery";
import { useViewer } from "@/components/ViewerProvider";
import { FeatureGate } from "@/lib/access";
import { GalleryDownloader, GalleryPaths, GalleryVariant } from "@/lib/gallery";
import { BrowserEnvironment } from "@/lib/webApp";

const VARIANT_ICONS = { original: Download, wallpaper: Smartphone };

const RESULT_MESSAGES = {
  shared: "저장 창을 열었어요. \"이미지 저장\"을 누르면 사진에 저장돼요.",
  downloaded: "다운로드했어요.",
};

/** 이 이미지를 마이 갤러리에 담았는지 + 담기/빼기. */
function useMyGallerySaved(imageId, viewer, enabled) {
  const { myGallery } = useGalleryRepos();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!enabled || !imageId) return undefined;
    let cancelled = false;
    myGallery.isSaved(imageId, viewer.userId).then((result) => {
      if (!cancelled) setSaved(result.saved);
    });
    return () => {
      cancelled = true;
    };
  }, [myGallery, imageId, viewer.userId, enabled]);

  async function toggle() {
    const next = !saved;
    setSaved(next);
    const result = await myGallery.set({ imageId, userId: viewer.userId, saved: next });
    if (!result.ok) setSaved(!next);
    return result;
  }

  return { saved: enabled && saved, toggle };
}

export default function GalleryViewer({ imageId }) {
  const viewer = useViewer();
  const { gallery } = useGalleryRepos();
  const { images, isLoading } = useGalleryImages();
  const gate = FeatureGate.check(viewer, FeatureGate.Feature.GALLERY);
  const image = images.find((i) => i.id === imageId) || null;
  const others = useMemo(() => images.filter((i) => i.id !== imageId), [images, imageId]);
  const { saved, toggle } = useMyGallerySaved(imageId, viewer, gate.allowed);
  const [busyKey, setBusyKey] = useState(null);
  const [message, setMessage] = useState("");
  const [isInApp, setIsInApp] = useState(false);

  // 앱 안 브라우저(카카오톡 등)인지는 브라우저에서만 알 수 있어서, 그린 직후에 확인합니다.
  useEffect(() => {
    const timer = setTimeout(() => setIsInApp(Boolean(new BrowserEnvironment(window).inApp)), 0);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) return <p className="py-16 text-center text-sm text-stone-400">이미지를 불러오는 중…</p>;
  if (!image) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-stone-500">이미지를 찾을 수 없어요.</p>
        <Link href={GalleryPaths.INDEX} className="text-sm font-medium text-night-700 hover:underline">
          갤러리 전체 보기
        </Link>
      </div>
    );
  }

  async function download(variant) {
    setBusyKey(variant.key);
    setMessage("");
    const result = await new GalleryDownloader(gallery).download(image, variant);
    setBusyKey(null);
    if (!result.ok) setMessage(`받지 못했어요: ${result.reason}`);
    else setMessage(RESULT_MESSAGES[result.result] || "");
  }

  async function toggleSaved() {
    setMessage("");
    const result = await toggle();
    if (!result.ok) setMessage(`마이 갤러리에 담지 못했어요: ${result.reason}`);
    else setMessage(saved ? "마이 갤러리에서 뺐어요." : "마이 갤러리에 담았어요. 마이 페이지 → 갤러리에서 볼 수 있어요.");
  }

  return (
    <div className="space-y-6 px-4 py-4">
      <figure className="space-y-3">
        <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-2xl bg-stone-900">
          {/* eslint-disable-next-line @next/next/no-img-element -- 운영자가 올린 이미지(Supabase 공개 주소)를 비율 그대로 보여줍니다 */}
          <img
            src={image.displayUrl}
            alt={image.displayTitle}
            width={image.width || undefined}
            height={image.height || undefined}
            className="max-h-[70vh] w-auto max-w-full object-contain"
          />
        </div>
        <figcaption>
          <p className="text-base font-semibold text-stone-900">{image.displayTitle}</p>
          {image.description && <p className="mt-0.5 text-sm text-stone-500">{image.description}</p>}
        </figcaption>
      </figure>

      <section className="space-y-2" aria-label="이미지 받기">
        <div className="grid grid-cols-2 gap-2">
          {GalleryVariant.ALL.map((variant) => {
            const Icon = gate.allowed ? VARIANT_ICONS[variant.key] : Lock;
            return (
              <button
                key={variant.key}
                type="button"
                onClick={() => download(variant)}
                disabled={!gate.allowed || busyKey !== null}
                className="flex items-center justify-center gap-1.5 rounded-full bg-night-700 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-night-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                <Icon size={15} /> {busyKey === variant.key ? "준비 중…" : variant.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={toggleSaved}
          disabled={!gate.allowed}
          className={`flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            saved ? "border-night-700 bg-night-50 text-night-800" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
          }`}
          aria-pressed={saved}
        >
          {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />} {saved ? "마이 갤러리에 담김" : "마이 갤러리"}
        </button>

        {!gate.allowed ? (
          <p className="text-center text-xs text-stone-500">
            원본·모바일 배경이미지 받기와 마이 갤러리는 구독자 전용이에요.{" "}
            <GatePrompt gate={gate} action="이용하기" />
          </p>
        ) : (
          isInApp && (
            <p className="text-center text-xs text-stone-500">
              카카오톡 등 앱 안에서는 이미지가 열리면 <b>길게 눌러 저장</b>해 주세요.
            </p>
          )
        )}
        {message && <p className="text-center text-xs text-night-700">{message}</p>}
      </section>

      {others.length > 0 && (
        <section aria-labelledby="gallery-others">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="gallery-others" className="text-sm font-semibold text-stone-900">
              다른 이미지
            </h2>
            <Link href={GalleryPaths.INDEX} className="text-xs text-night-700 hover:underline">
              전체 보기
            </Link>
          </div>
          <GalleryGrid images={others} size="sm" />
        </section>
      )}
    </div>
  );
}
