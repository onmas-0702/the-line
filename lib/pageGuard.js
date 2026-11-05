// 서버 전용 — 화면에 들어오기 전 권한 확인. 판단 규칙은 AccessPolicy, 여기서는
// "로그인 안 했으면 로그인 화면으로 보내기"만 맡습니다.

import { redirect } from "next/navigation";
import { AccessPolicy } from "@/lib/access";
import { AuthPaths } from "@/lib/auth";
import { ServerViewer } from "@/lib/supabaseServer";

export class PageGuard {
  /** 로그인한 사람만. 아니면 로그인 화면으로(로그인 뒤 returnTo로 돌아옴). */
  static async requireSignIn(returnTo) {
    const viewer = await ServerViewer.current();
    if (!viewer.isSignedIn) redirect(AuthPaths.login(returnTo));
    return viewer;
  }

  /** 그 채널의 운영자(소유자·편집자)만. 로그인은 했지만 운영자가 아니면 { allowed: false }. */
  static async requireChannelManager(channel, returnTo) {
    const viewer = await PageGuard.requireSignIn(returnTo);
    return { viewer, allowed: AccessPolicy.canManageChannel(viewer, channel) };
  }
}
