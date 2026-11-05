import { AuthSessionProxy } from "@/lib/authProxy";

const sessionProxy = new AuthSessionProxy();

// 로그인 세션 갱신(lib/authProxy.js). 정적 파일·이미지·아이콘에는 돌리지 않습니다.
export function proxy(request) {
  return sessionProxy.handle(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|m4a)$).*)",
  ],
};
