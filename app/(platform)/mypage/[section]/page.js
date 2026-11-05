import { notFound } from "next/navigation";
import MyPageSectionView from "@/components/mypage/MyPageSectionView";
import { MyPageMenu } from "@/lib/myPage";

// /mypage/{key} — 메뉴는 MyPageMenu.SECTIONS에, 화면은 components/mypage/sections.js에 등록합니다.
export default async function MyPageSectionPage({ params }) {
  const { section: key } = await params;
  if (!MyPageMenu.find(key)) notFound();
  return <MyPageSectionView sectionKey={key} />;
}
