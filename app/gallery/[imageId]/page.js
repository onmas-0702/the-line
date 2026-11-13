import GalleryViewer from "@/components/gallery/GalleryViewer";

export const metadata = { title: "이미지 갤러리" };

// 갤러리 크게 보기 — 화면은 GalleryViewer, 받기·담기 권한은 FeatureGate(구독자)가 정합니다.
export default async function GalleryImagePage({ params }) {
  const { imageId } = await params;
  return <GalleryViewer imageId={decodeURIComponent(imageId)} />;
}
