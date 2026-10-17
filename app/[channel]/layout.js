import { cache } from "react";
import { notFound } from "next/navigation";
import ChannelProvider from "@/components/ChannelProvider";
import NavBar from "@/components/NavBar";
import { ChannelResolver } from "@/lib/channel";
import { PLATFORM_NAME, SITE_NAME } from "@/lib/mockData";
import { AppStoreProvider } from "@/lib/store";

// 대표 주소 뒤의 첫 경로가 채널 주소입니다: /theline, /saebit …
// 레이아웃과 generateMetadata가 같은 요청에서 채널을 두 번 조회하지 않도록 cache로 묶습니다.
const resolveChannel = cache((slug) => new ChannelResolver({ defaultName: SITE_NAME }).resolve(slug));

export async function generateMetadata({ params }) {
  const { channel: slug } = await params;
  const channel = await resolveChannel(slug);
  return { title: channel ? `${channel.name} · ${PLATFORM_NAME}` : PLATFORM_NAME };
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
        <NavBar />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 sm:pb-6">{children}</main>
        <footer className="hidden border-t border-stone-200 py-4 text-center text-xs text-stone-400 sm:block">
          {channel.name} · {PLATFORM_NAME} · 와이어프레임 미리보기
        </footer>
      </AppStoreProvider>
    </ChannelProvider>
  );
}
