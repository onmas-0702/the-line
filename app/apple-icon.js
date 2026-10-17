import { ImageResponse } from "next/og";
import AppIconArt from "@/components/AppIconArt";
import { WebAppBrand } from "@/lib/webApp";

// iPhone "홈 화면에 추가" 아이콘(180px). iOS가 모서리를 알아서 둥글게 잘라 보여줍니다.
export const size = { width: WebAppBrand.APPLE_ICON_SIZE, height: WebAppBrand.APPLE_ICON_SIZE };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIconArt size={WebAppBrand.APPLE_ICON_SIZE} />, size);
}
