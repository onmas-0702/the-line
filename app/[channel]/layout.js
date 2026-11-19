import { notFound } from "next/navigation";
import ChannelProvider from "@/components/ChannelProvider";
import NavBar from "@/components/NavBar";
import { resolveChannel } from "@/lib/channelLookup";
import { ChannelDisplayName } from "@/lib/channel";
import { PLATFORM_NAME } from "@/lib/mockData";
import { AppStoreProvider } from "@/lib/store";

// 대표 주소 뒤의 첫 경로가 채널 주소입니다: /theline, /saebit …

export async function generateMetadata({ params }) {
  const { channel: slug } = await params;
  const channel = await resolveChannel(slug);
  if (!channel) return { title: PLATFORM_NAME };
  // "은혜의 밤 더 라인"처럼 이름에 플랫폼 이름이 이미 들어 있으면 " · 더 라인"을 덧붙이지 않습니다.
  return { title: ChannelDisplayName.footerText(channel.name, PLATFORM_NAME) };
}

export default async function ChannelLayout({ children, params }) {
  const { channel: slug } = await params;
  const channel = await resolveChannel(slug);
  if (!channel) notFound();

  if (!channel.isActive) {
    // 결제 대기(pending)·정지(suspended) 채널 — 결제/운영 정책이 붙으면 여기서 안내합니다.
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 text-center text-sm text-stone-500">
        &quot;{channel.name}&quot; 채널은 아직 준비 중입니다.
      </main>
    );
  }

  return (
    <ChannelProvider channel={channel.toJSON()}>
      <AppStoreProvider key={channel.slug}>
        {/* 콘텐츠 화면·채널 메인은 넓은 화면에서도 아래 가운데에 메뉴(data-bottom-nav)가 떠 있어서,
            그때만 맨 아래 줄 밑에 자리를 비워 겹치지 않게 합니다. */}
        <div className="group/channel flex flex-1 flex-col">
          <NavBar />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 sm:pb-6">{children}</main>
          <footer className="hidden border-t border-stone-200 py-4 text-center text-xs text-stone-400 sm:block sm:group-has-[[data-bottom-nav]]/channel:pb-20">
            {ChannelDisplayName.footerText(channel.name, PLATFORM_NAME)}
          </footer>
        </div>
      </AppStoreProvider>
    </ChannelProvider>
  );
}
