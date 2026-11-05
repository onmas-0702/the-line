import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveChannel } from "@/lib/channelLookup";
import { PageGuard } from "@/lib/pageGuard";

export const metadata = { title: "스튜디오" };

// 스튜디오(녹음·편집·콘텐츠 관리·디자인·공지)는 그 채널의 운영자만 들어올 수 있습니다.
// 로그인 안 했으면 로그인 화면으로, 운영자가 아니면 안내만 보여줍니다.
// (화면만 막는 것이고, 실제 저장 권한은 DB의 RLS — 0017 마이그레이션 — 가 막습니다.)
export default async function StudioLayout({ children, params }) {
  const { channel: slug } = await params;
  const channel = await resolveChannel(slug);
  if (!channel) notFound();

  const { allowed } = await PageGuard.requireChannelManager(channel, channel.studioPath());
  if (!allowed) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-base font-semibold text-stone-800">스튜디오는 채널 운영자만 쓸 수 있어요.</p>
        <p className="text-sm text-stone-500">운영자 계정으로 로그인했는지 확인해 주세요.</p>
        <Link href={channel.path()} className="text-sm font-medium text-amber-700 hover:underline">
          {channel.name} 채널로 가기
        </Link>
      </div>
    );
  }
  return children;
}
