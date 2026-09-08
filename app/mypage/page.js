"use client";

import { useMemo, useState } from "react";
import AudioCard from "@/components/AudioCard";
import ListControls from "@/components/ListControls";
import { CATEGORIES } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";

export default function MyPage() {
  const { myAudios, pageSize } = useAppStore();
  const [sortValue, setSortValue] = useState("latest");
  const [categoryFilter, setCategoryFilter] = useState("전체");

  const filtered = useMemo(() => {
    if (categoryFilter === "전체") return myAudios;
    return myAudios.filter((a) => a.category === categoryFilter);
  }, [myAudios, categoryFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sortValue === "popular") copy.sort((a, b) => b.plays - a.plays);
    else if (sortValue === "title") copy.sort((a, b) => a.title.localeCompare(b.title, "ko"));
    else copy.sort((a, b) => (a.date < b.date ? 1 : -1));
    return copy;
  }, [filtered, sortValue]);

  const visible = sorted.slice(0, pageSize);

  return (
    <div className="space-y-8">
      <section className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-700 text-lg font-semibold text-white">
          김
        </span>
        <div>
          <p className="text-sm font-semibold text-stone-900">김은혜 목사</p>
          <p className="text-xs text-stone-500">
            새빛교회 · mun9da1970@gmail.com
          </p>
        </div>
        <button
          type="button"
          className="ml-auto rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-500 hover:bg-stone-100"
        >
          로그아웃
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-stone-900">
            내 오디오
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {["전체", ...CATEGORIES].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  categoryFilter === c
                    ? "bg-amber-700 text-white"
                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <ListControls
          sortValue={sortValue}
          onSortChange={setSortValue}
          totalCount={sorted.length}
          shownCount={visible.length}
        />

        <div className="space-y-3">
          {visible.map((audio) => (
            <AudioCard key={audio.id} item={audio} context="mypage" />
          ))}
          {visible.length === 0 && (
            <p className="py-10 text-center text-sm text-stone-400">
              해당 분류의 오디오가 없습니다.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
