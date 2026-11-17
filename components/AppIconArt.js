import { WebAppBrand } from "@/lib/webApp";

// 앱 아이콘 그림(임시) — imageSrc(아이콘 그림, lib/appIconImage.js)가 있으면 그 그림을,
// 없으면 플랫폼 색 바탕에 흰 "라인" 하나를 그립니다. 정식 로고가 나오면 교체합니다.
// next/og의 ImageResponse 안에서 그리므로 인라인 스타일(flex)만 씁니다. 글꼴 없이 그려서
// 한글 글꼴이 없는 환경에서도 깨지지 않습니다.
export default function AppIconArt({ size, imageSrc = null }) {
  if (imageSrc) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={imageSrc} width={size} height={size} style={{ width: size, height: size, objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: WebAppBrand.BRAND_COLOR,
      }}
    >
      <div
        style={{
          width: size * 0.56,
          height: Math.max(4, size * 0.07),
          borderRadius: size,
          background: "#ffffff",
        }}
      />
    </div>
  );
}
