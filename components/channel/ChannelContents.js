"use client";

// 채널 페이지의 콘텐츠 영역 — 정렬 칩(최신순·인기순·날짜순) + 검색 + 카드 목록.

import { useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, Search, X } from "lucide-react";
import ContentThumbnail from "@/components/ContentThumbnail";
import { ChannelContentQuery } from "@/lib/channelProfile";

export function ContentToolbar({ query, onChange }) {
  const [isSearchOpen, setIsSearchOpen] = useState(Boolean(query.search));
  const inputRef = useRef(null);

  useEffect(() => {
    if (isSearchOpen) inputRef.current?.focus();
  }, [isSearchOpen]);

  function update(patch) {
    onChange(new ChannelContentQuery({ sort: query.sort, search: query.search, ...patch }));
  }

  return (
    <div className="sticky top-[57px] z-[5] -mx-4 border-b border-stone-200 bg-stone-50/95 px-4 py-2.5 backdrop-blur">
      {isSearchOpen ? (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5">
            <Search size={15} className="shrink-0 text-stone-400" />
            <input
              ref={inputRef}
              type="search"
              value={query.search}
              onChange={(e) => update({ search: e.target.value })}
              placeholder="제목, 메신저, 성경 본문, 태그로 검색"
              className="min-w-0 flex-1 bg-transparent text-sm text-stone-700 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              update({ search: "" });
              setIsSearchOpen(false);
            }}
            className="rounded-full p-1.5 text-stone-500 hover:bg-stone-200"
            aria-label="검색 닫기"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {ChannelContentQuery.SORTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => update({ sort: option.value })}
              aria-pressed={query.sort === option.value}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                query.sort === option.value ? "bg-stone-900 text-white" : "bg-stone-200/70 text-stone-700 hover:bg-stone-200"
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="ml-auto rounded-full p-1.5 text-stone-600 hover:bg-stone-200"
            aria-label="채널 안에서 검색"
          >
            <Search size={19} />
          </button>
        </div>
      )}
    </div>
  );
}

function ContentCard({ item, thumbnailUrl, isCurrent, isPlaying, onSelect }) {
  const playable = Boolean(item.previewUrl);
  return (
    <article id={`content-${item.id}`} className="scroll-mt-32">
      <button
        type="button"
        onClick={() => onSelect(item)}
        disabled={!playable}
        title={playable ? undefined : "샘플 데이터입니다 (재생 준비중)"}
        className={`group relative block w-full rounded-2xl text-left disabled:cursor-not-allowed ${
          isCurrent ? "ring-2 ring-amber-600 ring-offset-2 ring-offset-stone-50" : ""
        }`}
        aria-label={isPlaying ? `${item.title} 정지` : `${item.title} 재생`}
      >
        <ContentThumbnail item={item} imageUrl={thumbnailUrl} className="aspect-square w-full transition group-hover:brightness-95" />
        <span
          className={`absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full shadow ${
            playable ? "bg-white text-amber-800" : "bg-white/60 text-stone-400"
          }`}
        >
          {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
        </span>
      </button>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-stone-900">{item.title}</h3>
      <p className="mt-0.5 truncate text-xs text-amber-700">
        {item.pastorName}
        {item.scriptureReference ? ` · ${item.scriptureReference}` : ""}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-400">
        <Headphones size={11} /> 조회수 {item.plays || 0}회 · {item.date}
      </p>
    </article>
  );
}

export function ContentGrid({ items, thumbnailUrl, currentId, isPlaying, onSelect, isSearching }) {
  if (items.length === 0) {
    return (
      <p className="mt-6 rounded-xl bg-stone-100 px-4 py-10 text-center text-sm text-stone-400">
        {isSearching ? "검색 결과가 없습니다." : "아직 등록된 콘텐츠가 없습니다."}
      </p>
    );
  }
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
      {items.map((item) => (
        <ContentCard
          key={item.id}
          item={item}
          thumbnailUrl={thumbnailUrl}
          isCurrent={currentId === item.id}
          isPlaying={isPlaying && currentId === item.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
