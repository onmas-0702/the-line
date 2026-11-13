import LandingHeader from "@/components/landing/LandingHeader";
import PlatformFooter from "@/components/landing/PlatformFooter";

// 이미지 갤러리(/gallery, /gallery/{id}) — 탑 메뉴는 플랫폼 메인과 같은 상단을 그대로 씁니다.
// 제목을 누르면 메인으로 돌아갑니다.
export default function GalleryLayout({ children }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col bg-stone-50">
      <LandingHeader homeLink />
      <main className="flex-1">{children}</main>
      <PlatformFooter />
    </div>
  );
}
