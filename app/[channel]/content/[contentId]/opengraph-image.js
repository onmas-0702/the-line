import { SharePreview } from "@/lib/sharePreview";

// 콘텐츠 공유 미리보기 그림 — 배경이미지(webp)를 카카오톡이 읽을 수 있는 JPG 1200×630으로.
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const alt = "콘텐츠 미리보기";
export const revalidate = 3600; // 배경이미지를 바꾸면 한 시간 안에 새 그림으로

export default async function Image({ params }) {
  const { contentId } = await params;
  const content = await SharePreview.loadContent(contentId);
  const bytes = await SharePreview.contentImage(content?.imageUrl);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(bytes, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" } });
}
