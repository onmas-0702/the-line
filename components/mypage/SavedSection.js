"use client";

// 담아두기 — 좋아요나 담아두기를 한 메시지 목록. 제목·설교자·교회·성경 본문·태그로 검색.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Heart, Search } from "lucide-react";
import { useViewer } from "@/components/ViewerProvider";
import { LoadState, useLoaded, useMyPageRepos } from "@/components/mypage/useMyPageData";
import { TimeFormat } from "@/lib/audio";
import { Channel } from "@/lib/channel";
import { AudioMarkKind } from "@/lib/engagement";
import { SavedAudioQuery } from "@/lib/myPage";

export default function SavedSection() {
  const viewer = useViewer();
  const repos = useMyPageRepos();
  const { result, isLoading, setResult } = useLoaded(() => repos.marks.listMine(viewer.userId), [repos, viewer.userId]);
  const [query, setQuery] = useState(new SavedAudioQuery());
  const items = useMemo(() => result?.items || [], [result]);
  const visible = useMemo(() => query.apply(items), [query, items]);

  async function unmark(item, kind) {
    const audioId = item.audioRow.id;
    const res = await repos.marks.set({ audioId, userId: viewer.userId, kind, on: false });
    if (!res.ok) return;
    setResult((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.audioRow.id === audioId ? it.withoutKind(kind) : it)).filter(Boolean),
    }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3.5 py-2">
        <Search size={15} className="shrink-0 text-stone-400" />
        <input
          value={query.text}
          onChange={(e) => setQuery(query.with({ text: e.target.value }))}
          placeholder="제목, 설교자, 성경 본문, 태그로 찾기"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div className="flex gap-1.5">
        {Object.values(SavedAudioQuery.Filter).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setQuery(query.with({ filter }))}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              query.filter === filter ? "bg-stone-800 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
            }`}
          >
            {SavedAudioQuery.FILTER_LABELS[filter]}
          </button>
        ))}
      </div>

      <LoadState
        isLoading={isLoading}
        result={result}
        empty={
          visible.length === 0 &&
          (items.length === 0 ? "메시지 화면에서 좋아요나 담아두기를 누르면 여기에 모여요." : "찾는 메시지가 없어요.")
        }
      >
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {visible.map((item) => {
            const row = item.audioRow;
            const slug = row.channel?.slug;
            return (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={slug ? Channel.contentHref(slug, row.id) : "#"} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800">{row.title}</p>
                  <p className="mt-0.5 truncate text-xs text-stone-400">
                    {[row.pastor_name, row.scripture_reference, TimeFormat.duration(row.duration_seconds)].filter(Boolean).join(" · ")}
                  </p>
                </Link>
                <div className="flex shrink-0 gap-1">
                  {item.kinds.includes(AudioMarkKind.LIKE) && (
                    <button type="button" onClick={() => unmark(item, AudioMarkKind.LIKE)} className="p-1.5 text-rose-500" aria-label="좋아요 취소" title="좋아요 취소">
                      <Heart size={15} fill="currentColor" />
                    </button>
                  )}
                  {item.kinds.includes(AudioMarkKind.SAVE) && (
                    <button type="button" onClick={() => unmark(item, AudioMarkKind.SAVE)} className="p-1.5 text-amber-700" aria-label="담아두기 취소" title="담아두기 취소">
                      <Bookmark size={15} fill="currentColor" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </LoadState>
    </div>
  );
}
