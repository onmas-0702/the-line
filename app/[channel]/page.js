"use client";

// 채널 메인 페이지(/{채널주소}) — 구독자가 보는 채널 화면. 유튜브 채널처럼
//   대표이미지(배너) → 네모 로고 + 채널 이름·구독자·소개글 → 버튼(관리자: 제작·관리)
//   → 정렬(최신순·인기순·날짜순)·검색 → 이 채널의 콘텐츠만 → 하단 재생 바.
// 랜딩 페이지에서 콘텐츠를 눌러 들어오면(?c={콘텐츠 id}) 그 콘텐츠를 재생 바에 띄우고
// 카드 위치로 스크롤합니다.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ChannelHeader from "@/components/channel/ChannelHeader";
import { ContentGrid, ContentToolbar } from "@/components/channel/ChannelContents";
import { PlayerBar, useChannelPlayer } from "@/components/channel/ChannelPlayer";
import { ChannelContentQuery } from "@/lib/channelProfile";
import { useAppStore } from "@/lib/store";

export default function ChannelHomePage() {
  const { audios, artwork } = useAppStore();
  const selectedId = useSearchParams().get("c");
  const [query, setQuery] = useState(() => new ChannelContentQuery());
  const [dismissedSelection, setDismissedSelection] = useState(false);
  const player = useChannelPlayer();

  const items = useMemo(() => query.apply(audios), [query, audios]);
  const selected = (selectedId && audios.find((a) => a.id === selectedId)) || null;
  // 재생 바에는 지금 재생한 콘텐츠, 없으면 랜딩에서 골라 들어온 콘텐츠를 띄웁니다.
  const barItem = player.current ?? (dismissedSelection ? null : selected);

  // 골라 들어온 콘텐츠의 카드가 보이도록 한 번 스크롤합니다.
  useEffect(() => {
    if (!selected) return;
    document.getElementById(`content-${selected.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected]);

  return (
    <div className={barItem ? "pb-24" : ""}>
      <ChannelHeader contentCount={audios.length} />

      <div className="mt-6">
        <ContentToolbar query={query} onChange={setQuery} />
        <ContentGrid
          items={items}
          thumbnailUrl={artwork.thumbnailUrl}
          currentId={barItem?.id}
          isPlaying={player.isPlaying}
          onSelect={player.toggle}
          isSearching={Boolean(query.search.trim())}
        />
      </div>

      <PlayerBar
        player={player}
        item={barItem}
        thumbnailUrl={artwork.thumbnailUrl}
        onClose={() => setDismissedSelection(true)}
      />
    </div>
  );
}
