"use client";

// 현재 URL의 채널(/theline, /saebit …)과, 그 채널로 한정된 저장소들을 하위
// 컴포넌트에 나눠줍니다. 채널 레이아웃(서버)이 찾은 채널을 평범한 객체로 넘기면
// 여기서 Channel 인스턴스로 되살립니다.

import { createContext, useContext, useMemo } from "react";
import { AudioRepository, BackgroundTrackRepository } from "@/lib/audioStorage";
import { Channel, ChannelRepository } from "@/lib/channel";
import { SiteSettingsRepository } from "@/lib/siteSettings";

const ChannelContext = createContext(null);

export default function ChannelProvider({ channel: channelData, children }) {
  const value = useMemo(() => {
    const channel = new Channel(channelData);
    const scope = { channelId: channel.id };
    return {
      channel,
      repos: {
        audios: new AudioRepository(scope),
        backgroundTracks: new BackgroundTrackRepository(scope),
        siteSettings: new SiteSettingsRepository(scope),
        channels: new ChannelRepository(),
      },
    };
    // 채널이 바뀔 때만 다시 만듭니다(같은 채널 안에서 이동할 땐 그대로 유지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelData.id, channelData.slug]);

  return <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>;
}

export function useChannel() {
  const ctx = useContext(ChannelContext);
  if (!ctx) {
    throw new Error("useChannel must be used within ChannelProvider");
  }
  return ctx;
}
