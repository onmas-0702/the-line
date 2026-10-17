import "./globals.css";
import ViewerProvider from "@/components/ViewerProvider";
import { PLATFORM_NAME } from "@/lib/mockData";

// 플랫폼 전체의 뼈대만 둡니다. 채널별 화면(내비게이션·배경 스킨·스토어)은
// app/[channel]/layout.js, 로그인 등 플랫폼 공용 화면은 app/(platform)/layout.js에 있습니다.
export const metadata = {
  title: PLATFORM_NAME,
  description: "목회자를 위한 짧은 오디오 나눔 플랫폼 (와이어프레임)",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-800">
        <ViewerProvider>{children}</ViewerProvider>
      </body>
    </html>
  );
}
