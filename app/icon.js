import { ImageResponse } from "next/og";
import AppIconArt from "@/components/AppIconArt";
import { WebAppBrand } from "@/lib/webApp";

// 홈 화면·설치용 앱 아이콘(192·512px) — 주소: /icon/192, /icon/512
export function generateImageMetadata() {
  return WebAppBrand.ICON_SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }) {
  const size = Number(await id);
  return new ImageResponse(<AppIconArt size={size} />, { width: size, height: size });
}
