import MyPageShell from "@/components/mypage/MyPageShell";
import { MyPageMenu } from "@/lib/myPage";
import { PageGuard } from "@/lib/pageGuard";

export const metadata = { title: "마이 페이지" };

// 마이 페이지는 로그인한 사람만. 메뉴별 권한(구독자 전용)은 각 섹션 화면이 FeatureGate로 확인합니다.
export default async function MyPageLayout({ children }) {
  await PageGuard.requireSignIn(MyPageMenu.BASE_PATH);
  return <MyPageShell>{children}</MyPageShell>;
}
