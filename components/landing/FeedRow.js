"use client";

import Link from "next/link";
import ContentThumbnail from "@/components/ContentThumbnail";
import { Headphones, Pause, Play } from "lucide-react";

// 랜딩 콘텐츠 구간의 한 줄 — 모바일에서 옆으로 밀어서 넘겨보는 카드 목록입니다.

// 카드(표지·제목)를 누르면 그 콘텐츠의 채널 페이지로 이동하고, 표지 위 재생 버튼은
// 이동 없이 그 자리에서 바로 들려줍니다. 버튼은 링크 안에 넣을 수 없어서, 표지 영역에
// 링크와 나란히 겹쳐 놓습니다.
function FeedCard({ item, rank, isPlaying, onTogglePlay }) {
  const playable = Boolean(item.previewUrl);
  return (
    <article className="group w-[40%] max-w-[168px] shrink-0 snap-start sm:w-[168px]">
      <div className="relative aspect-square w-full">
        <Link href={item.href} tabIndex={-1} aria-hidden className="absolute inset-0 transition group-hover:brightness-95">
          <ContentThumbnail item={item} imageUrl={item.thumbnailUrl} rank={rank} className="h-full w-full" />
        </Link>
        <button
          type="button"
          onClick={() => onTogglePlay(item)}
          disabled={!playable}
          title={playable ? "바로 듣기" : "샘플 데이터입니다 (재생 준비중)"}
          className={`absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full shadow transition disabled:cursor-not-allowed ${
            playable ? "bg-white text-amber-800 hover:scale-105" : "bg-white/60 text-stone-400"
          }`}
          aria-label={isPlaying ? `${item.title} 정지` : `${item.title} 바로 듣기`}
        >
          {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
        </button>
      </div>
      <Link href={item.href} className="block">
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-stone-900 group-hover:text-amber-800">
          {item.title}
        </h3>
        <p className="mt-0.5 truncate text-xs text-amber-700">
          {item.pastorName}
          {item.church ? ` · ${item.church}` : ""}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-400">
          <Headphones size={11} /> {item.plays || 0}회
        </p>
      </Link>
    </article>
  );
}

export default function FeedRow({ title, subtitle, items, ranked = false, playingId, onTogglePlay, emptyText }) {
  return (
    <section className="py-4">
      <div className="px-4">
        <h2 className="text-base font-semibold text-stone-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-stone-400">{subtitle}</p>}
      </div>
      {items.length === 0 ? (
        <p className="mx-4 mt-3 rounded-xl bg-stone-100 px-4 py-6 text-center text-xs text-stone-400">{emptyText}</p>
      ) : (
        <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item, i) => (
            <FeedCard
              key={item.id}
              item={item}
              rank={ranked ? i + 1 : null}
              isPlaying={playingId === item.id}
              onTogglePlay={onTogglePlay}
            />
          ))}
        </div>
      )}
    </section>
  );
}
