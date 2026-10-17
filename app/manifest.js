import { WebAppBrand } from "@/lib/webApp";

// 웹앱 설정 — 휴대폰에서 "홈 화면에 추가"하면 이 정보로 앱 아이콘이 생기고, 아이콘으로
// 열면 주소창 없이(standalone) 플랫폼 화면만 꽉 차게 보입니다.
export default function manifest() {
  return {
    name: WebAppBrand.NAME,
    short_name: WebAppBrand.SHORT_NAME,
    description: WebAppBrand.DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ko",
    background_color: WebAppBrand.BACKGROUND_COLOR,
    theme_color: WebAppBrand.THEME_COLOR,
    icons: WebAppBrand.ICON_SIZES.map((size) => ({
      src: WebAppBrand.iconPath(size),
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
