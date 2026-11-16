"use client";

// 플랫폼 메인의 배너 영역 — 스튜디오 "배너" 탭에서 올린 배너를 순서대로 한 장씩 보여 줍니다.
// 여러 장이면 손가락으로 넘기거나 아래 점을 누르고, 가만히 두면 5초마다 다음 장으로 넘어갑니다
// (만지거나 마우스를 올린 동안·움직임 줄이기 설정에서는 멈춤). 배너가 없으면 영역을 그리지 않습니다.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BannerRepository } from "@/lib/banners";
import { SlideTrack } from "@/lib/carousel";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

function useLandingBanners() {
  const repository = useMemo(() => new BannerRepository(), []);
  const [banners, setBanners] = useState([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let cancelled = false;
    repository.list().then((result) => {
      if (!cancelled && result.ok) setBanners(result.banners);
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);
  return banners;
}

function Slide({ banner, index, count }) {
  const picture = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={banner.imageUrl}
        alt={banner.title || `배너 ${index + 1}`}
        loading={index === 0 ? "eager" : "lazy"}
        draggable={false}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
      />
      {banner.title && (
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/55 via-black/15 to-transparent px-4 pb-3 pt-10">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-white drop-shadow-sm">{banner.title}</p>
        </div>
      )}
    </>
  );
  const frame = "group relative block aspect-[5/2] w-full overflow-hidden rounded-2xl bg-stone-200";
  const label = `${count}장 중 ${index + 1}번째 배너`;

  return (
    <div className="w-full shrink-0 snap-center px-4" role="group" aria-roledescription="slide" aria-label={label}>
      {!banner.hasLink ? (
        <div className={frame}>{picture}</div>
      ) : banner.isExternal ? (
        <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className={frame}>
          {picture}
        </a>
      ) : (
        <Link href={banner.linkUrl} className={frame}>
          {picture}
        </Link>
      )}
    </div>
  );
}

export default function BannerCarousel() {
  return <BannerSlides banners={useLandingBanners()} />;
}

/** 배너 목록을 받아 그리기만 하는 부분(LandingBanner[]). */
export function BannerSlides({ banners }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const count = banners.length;

  // 넘길 때마다 아래 점을 맞춥니다.
  useEffect(() => SlideTrack.onIndexChange(trackRef.current, setIndex), [count]);

  useEffect(() => {
    if (count < 2 || isPaused || SlideTrack.prefersReducedMotion()) return undefined;
    const timer = setInterval(() => {
      const el = trackRef.current;
      SlideTrack.scrollTo(el, SlideTrack.next(SlideTrack.indexOf(el), count));
    }, SlideTrack.AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [count, isPaused]);

  if (count === 0) return null;

  return (
    <section
      className="py-4"
      aria-roledescription="carousel"
      aria-label="배너"
      onPointerEnter={() => setIsPaused(true)}
      onPointerLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((banner, i) => (
          <Slide key={banner.id} banner={banner} index={i} count={count} />
        ))}
      </div>

      {count > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {banners.map((banner, i) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => SlideTrack.scrollTo(trackRef.current, i)}
              aria-label={`${i + 1}번째 배너 보기`}
              aria-current={i === index ? "true" : undefined}
              className={`h-1.5 rounded-full p-0 transition-all duration-300 ${
                i === index ? "w-5 bg-night-700" : "w-1.5 bg-stone-300"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
