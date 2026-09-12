import "./globals.css";
import NavBar from "@/components/NavBar";
import SiteBackground from "@/components/SiteBackground";
import { AppStoreProvider } from "@/lib/store";
import { SITE_NAME } from "@/lib/mockData";

export const metadata = {
  title: SITE_NAME,
  description: "목회자를 위한 짧은 오디오 나눔 플랫폼 (와이어프레임)",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-800">
        <AppStoreProvider>
          <SiteBackground />
          <NavBar />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 sm:pb-6">
            {children}
          </main>
          <footer className="hidden border-t border-stone-200 py-4 text-center text-xs text-stone-400 sm:block">
            {SITE_NAME} · 와이어프레임 미리보기
          </footer>
        </AppStoreProvider>
      </body>
    </html>
  );
}
