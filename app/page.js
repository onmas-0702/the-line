import LandingPage from "@/components/landing/LandingPage";
import { PLATFORM_TITLE } from "@/lib/mockData";

// 더 라인 플랫폼의 대표 페이지. 각 채널은 /{채널주소}에 있습니다.
export const metadata = {
  title: PLATFORM_TITLE,
};

export default function PlatformHome() {
  return <LandingPage />;
}
