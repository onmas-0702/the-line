"use client";

// 지금 화면을 보는 사람(Viewer)을 하위 컴포넌트에 나눠줍니다. 권한 판단은 항상
// AccessPolicy(lib/access.js)에 Viewer를 넘겨서 합니다.
//
// 로그인(Supabase Auth)이 붙기 전까지는:
//   · NEXT_PUBLIC_PREVIEW_ADMIN=true  → 임시 관리자(모든 채널 소유자)로 봅니다.
//   · NEXT_PUBLIC_PREVIEW_ADMIN=false → 비회원으로 봅니다(구독자가 보는 화면 확인용).
//   · 설정하지 않으면 개발 환경(next dev)에서만 임시 관리자, 배포 환경에서는 비회원.
// 로그인이 붙으면 여기서 세션·구독·채널 역할을 읽어 실제 Viewer를 만들면 됩니다.

import { createContext, useContext, useMemo } from "react";
import { Viewer } from "@/lib/access";

const ViewerContext = createContext(Viewer.guest());

function isPreviewAdminEnabled() {
  const flag = process.env.NEXT_PUBLIC_PREVIEW_ADMIN;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "development";
}

export default function ViewerProvider({ children }) {
  const viewer = useMemo(() => (isPreviewAdminEnabled() ? Viewer.previewAdmin() : Viewer.guest()), []);
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  return useContext(ViewerContext);
}
