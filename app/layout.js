import "./globals.css";
import InstallBanner from "@/components/InstallBanner";
import ViewerProvider from "@/components/ViewerProvider";
import { PLATFORM_NAME } from "@/lib/mockData";
import { WebAppBrand } from "@/lib/webApp";

// 플랫폼 전체의 뼈대만 둡니다. 채널별 화면(내비게이션·스토어)은 app/[channel]/layout.js,
// 로그인 등 플랫폼 공용 화면은 app/(platform)/layout.js에 있습니다.
// 웹앱 설정(app/manifest.js, app/icon.js, app/apple-icon.js) 덕분에 휴대폰에서 "홈 화면에
// 추가"한 뒤 아이콘으로 열면 주소창 없이 플랫폼 화면만 꽉 차게 보입니다.
export const metadata = {
  title: PLATFORM_NAME,
  description: WebAppBrand.DESCRIPTION,
  applicationName: WebAppBrand.SHORT_NAME,
  appleWebApp: {
    capable: true,
    title: WebAppBrand.SHORT_NAME,
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: WebAppBrand.THEME_COLOR,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-800">
        <ViewerProvider>{children}</ViewerProvider>
        <InstallBanner />
      </body>
    </html>
  );
}
