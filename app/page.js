"use client";

import { useMemo, useState } from "react";
import AudioCard from "@/components/AudioCard";
import ListControls from "@/components/ListControls";
import { SITE_NAME } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";

export default function HomePage() {
  const { audios, pageSize } = useAppStore();
  const [sortValue, setSortValue] = useState("latest");

  const sorted = useMemo(() => {
    const copy = [...audios];
    if (sortValue === "popular") copy.sort((a, b) => b.plays - a.plays);
    else if (sortValue === "title") copy.sort((a, b) => a.title.localeCompare(b.title, "ko"));
    else copy.sort((a, b) => (a.date < b.date ? 1 : -1));
    return copy;
  }, [audios, sortValue]);

  const visible = sorted.slice(0, pageSize);

  return (
    <div className="space-y-4">
      <section>
        <h1 className="text-lg font-semibold text-stone-900">{SITE_NAME}</h1>
        <p className="mt-1 text-sm text-stone-500">
          동료 목회자들이 전하는 짧은 오디오 메시지를 들어보세요.
        </p>
      </section>

      <ListControls
        sortValue={sortValue}
        onSortChange={setSortValue}
        totalCount={sorted.length}
        shownCount={visible.length}
      />

      <div className="space-y-4">
        {visible.map((item) => (
          <AudioCard key={item.id} item={item} />
        ))}
        {visible.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-400">
            아직 등록된 나눔이 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
