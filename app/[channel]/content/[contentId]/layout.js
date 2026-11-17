import { SharePreview } from "@/lib/sharePreview";

// 콘텐츠 화면을 카카오톡 등에 공유했을 때의 제목·설명(그림은 같은 폴더의 opengraph-image.js).
// 로그인 없는(공개) 연결로 읽으므로, 예약 중·비공개 콘텐츠는 사이트 기본 미리보기가 나옵니다.
export async function generateMetadata({ params }) {
  const { channel, contentId } = await params;
  const content = await SharePreview.loadContent(contentId);
  if (!content) return {};
  return SharePreview.forContent({ ...content, path: `/${channel}/content/${contentId}` });
}

export default function ContentLayout({ children }) {
  return children;
}
