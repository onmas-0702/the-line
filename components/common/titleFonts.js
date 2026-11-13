import { Cormorant_Garamond, Song_Myung } from "next/font/google";

// 제목 전용 감성 폰트 — 국문은 송명(붓 느낌 명조), 영문은 이탤릭 세리프.
// 메인 상단 제목과 채널 이름에서 함께 씁니다.
export const titleKo = Song_Myung({ weight: "400", preload: false, display: "swap" });
export const titleEn = Cormorant_Garamond({ weight: "500", style: "italic", subsets: ["latin"], display: "swap" });
