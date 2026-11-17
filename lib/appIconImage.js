// 앱 아이콘 그림(public/brand/app-icon.png) — 정식 로고 전까지 쓰는 "잠든 반달"(원본: public/brand/moon-icon.svg).
// 이 파일만 바꾸면 홈 화면·설치 아이콘이 함께 바뀝니다. 탭 아이콘(app/favicon.ico)은 같은 그림에서 따로 만듭니다.
// app/icon.js·app/apple-icon.js(서버에서 그림)에서만 부릅니다.

import { readFile } from "node:fs/promises";
import path from "node:path";

export class AppIconImage {
  static FILE = path.join(process.cwd(), "public", "brand", "app-icon.png");

  /** 아이콘 그림 안에 넣을 data: 주소. 파일이 없으면 null(기본 그림으로 그림). */
  static async dataUri() {
    try {
      const bytes = await readFile(AppIconImage.FILE);
      return `data:image/png;base64,${bytes.toString("base64")}`;
    } catch {
      return null;
    }
  }
}
