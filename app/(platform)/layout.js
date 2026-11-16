import PlatformChrome from "@/components/PlatformChrome";

// 특정 채널에 속하지 않는 플랫폼 공용 화면(로그인·회원가입, 구독 안내, 마이 페이지, 이후
// 채널 개설 신청·운영자 관리)의 레이아웃입니다. 이 폴더 아래의 경로 이름은 채널 주소로 쓸 수
// 없도록 lib/channel.js의 ChannelSlug.RESERVED에 함께 등록해야 합니다.
// 메뉴는 PlatformChrome이 경로를 보고 고릅니다(마이 페이지는 아래 아이콘 줄).
export default function PlatformLayout({ children }) {
  return (
    // 아래 아이콘 줄(data-bottom-nav)이 있는 화면은 맨 아래 내용이 가려지지 않게 밑에 자리를 비웁니다.
    <div className="group/platform flex flex-1 flex-col">
      <PlatformChrome />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 group-has-[[data-bottom-nav]]/platform:pb-24">{children}</main>
    </div>
  );
}
