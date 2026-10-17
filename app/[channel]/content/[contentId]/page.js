"use client";

// 콘텐츠 화면(/{채널주소}/content/{콘텐츠 id}) — 채널 페이지·랜딩에서 콘텐츠를 누르면 오는 곳.
// 그 콘텐츠의 배경이미지(없으면 채널 기본 배경 이미지)가 화면 전체에 깔리고, 가운데에
// 제목과 큰 재생 버튼, 남은 시간이 나오는 "한 장의 그림" 같은 화면입니다. 아래에는 같은
// 채널의 다른 콘텐츠가 담백한 목록으로 이어지고, 누르면 그 콘텐츠 화면으로 넘어갑니다.
// 배경 이미지가 하나도 없으면 흰 배경 위의 기본 모습(호박색)으로 보여줍니다.

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import { useContentPlayer } from "@/components/content/useContentPlayer";
import { TimeFormat } from "@/lib/audio";
import { ChannelContentQuery } from "@/lib/channelProfile";
import { useAppStore } from "@/lib/store";

const OTHER_CONTENTS_COUNT = 10;

export default function ContentPage() {
  const { contentId } = useParams();
  const { audios, artwork, isHydrated } = useAppStore();
  const { channel } = useChannel();
  const player = useContentPlayer();

  const item = audios.find((a) => a.id === contentId) || null;
  const others = useMemo(
    () => new ChannelContentQuery().apply(audios).filter((a) => a.id !== contentId).slice(0, OTHER_CONTENTS_COUNT),
    [audios, contentId]
  );

  if (!item) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-stone-400">{isHydrated ? "콘텐츠를 찾을 수 없습니다." : "콘텐츠를 불러오는 중…"}</p>
        {isHydrated && (
          <Link href={channel.path()} className="text-sm font-medium text-amber-700 hover:underline">
            {channel.name} 채널로 가기
          </Link>
        )}
      </div>
    );
  }

  const backgroundUrl = artwork.thumbnailFor(item);
  const isImmersive = Boolean(backgroundUrl);
  const { isPlaying, remaining } = player.stateOf(item);
  const text = isImmersive ? "text-white drop-shadow" : "text-stone-900";
  const subText = isImmersive ? "text-white/80 drop-shadow" : "text-stone-400";

  return (
    <div className="flex min-h-[75vh] flex-col">
      {isImmersive && (
        <div aria-hidden className="fixed inset-0 -z-10 bg-stone-800">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${backgroundUrl})` }} />
          {/* 어떤 이미지 위에서도 글자가 읽히도록 은은하게 어둡게 */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/50" />
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        <h1 className={`max-w-xs text-xl font-semibold leading-snug ${text}`}>{item.title}</h1>
        {(item.pastorName || item.scriptureReference) && (
          <p className={`-mt-2 text-xs ${subText}`}>
            {[item.pastorName, item.scriptureReference].filter(Boolean).join(" · ")}
          </p>
        )}
        <button
          type="button"
          onClick={() => player.toggle(item)}
          disabled={!item.previewUrl}
          title={item.previewUrl ? undefined : "샘플 데이터입니다 (재생 준비중)"}
          className={`flex h-20 w-20 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
            isImmersive
              ? "bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
              : "bg-amber-700 text-white hover:bg-amber-800"
          }`}
          aria-label={isPlaying ? "정지" : "재생"}
        >
          {isPlaying ? <Pause size={30} /> : <Play size={30} className="ml-1" />}
        </button>
        <p className={`text-xs tabular-nums ${subText}`}>
          {remaining !== null ? TimeFormat.duration(remaining) : item.duration}
        </p>
      </div>

      {others.length > 0 && (
        <div className="space-y-0.5 px-2 pb-6">
          {others.map((other) => (
            <Link
              key={other.id}
              href={channel.contentPath(other.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition ${
                isImmersive ? "hover:bg-white/10" : "hover:bg-stone-100"
              }`}
            >
              <span className={`flex min-w-0 items-center gap-2 text-sm ${isImmersive ? "text-white drop-shadow" : "text-stone-700"}`}>
                <Play size={13} className="shrink-0" />
                <span className="truncate">{other.title}</span>
              </span>
              <span className={`shrink-0 text-xs tabular-nums ${subText}`}>{other.duration}</span>
            </Link>
          ))}
        </div>
      )}

      <audio {...player.audioProps} />
    </div>
  );
}
