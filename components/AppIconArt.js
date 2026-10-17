import { WebAppBrand } from "@/lib/webApp";

// 앱 아이콘 그림(임시) — 플랫폼 색 바탕에 흰 "라인" 하나. 로고 디자인이 나오면 교체합니다.
// next/og의 ImageResponse 안에서 그리므로 인라인 스타일(flex)만 씁니다. 글꼴 없이 그려서
// 한글 글꼴이 없는 환경에서도 깨지지 않습니다.
export default function AppIconArt({ size }) {
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
