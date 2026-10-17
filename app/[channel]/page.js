"use client";

// 채널 메인 페이지(/{채널주소}) — 구독자가 보는 채널 화면. 유튜브 채널처럼
//   대표이미지(배너) → 네모 로고 + 채널 이름·구독자·소개글 → 버튼(관리자: 제작·관리)
//   → 정렬(최신순·인기순·날짜순)·검색 → 이 채널의 콘텐츠만.
// 콘텐츠 카드를 누르면 콘텐츠 화면(/{채널주소}/content/{id})으로 이동해서 듣습니다.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ChannelHeader from "@/components/channel/ChannelHeader";
import { ContentGrid, ContentToolbar } from "@/components/channel/ChannelContents";
import { useChannel } from "@/components/ChannelProvider";
import { ChannelContentQuery } from "@/lib/channelProfile";
import { useAppStore } from "@/lib/store";

export default function ChannelHomePage() {
  const { audios, artwork } = useAppStore();
  const { channel } = useChannel();
  const router = useRouter();
  const legacySelectedId = useSearchParams().get("c");
  const [query, setQuery] = useState(() => new ChannelContentQuery());
  const items = useMemo(() => query.apply(audios), [query, audios]);

  // 예전 주소(/{채널}?c={id})로 들어오면 콘텐츠 화면으로 보냅니다.
  useEffect(() => {
    if (legacySelectedId) router.replace(channel.contentPath(legacySelectedId));
  }, [legacySelectedId, channel, router]);

  return (
    <div>
      <ChannelHeader contentCount={audios.length} />

      <div className="mt-6">
        <ContentToolbar query={query} onChange={setQuery} />
        <ContentGrid items={items} artwork={artwork} channel={channel} isSearching={Boolean(query.search.trim())} />
      </div>
    </div>
  );
}
