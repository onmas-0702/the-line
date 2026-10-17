import Link from "next/link";
import { ChannelSlug } from "@/lib/channel";
import { PLATFORM_NAME } from "@/lib/mockData";

// 특정 채널에 속하지 않는 플랫폼 공용 화면(로그인·회원가입, 이후 채널 개설 신청·
// 결제·운영자 관리)의 레이아웃입니다. 이 폴더 아래의 경로 이름은 채널 주소로 쓸 수
// 없도록 lib/channel.js의 ChannelSlug.RESERVED에 함께 등록해야 합니다.
export default function PlatformLayout({ children }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <Link href={`/${ChannelSlug.DEFAULT}`} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-700 text-sm font-semibold text-white">
              은
            </span>
            <span className="text-sm font-semibold text-stone-800 sm:text-base">{PLATFORM_NAME}</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
