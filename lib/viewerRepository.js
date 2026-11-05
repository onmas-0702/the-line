// 로그인한 사람의 등급·채널 역할을 DB에서 읽어 Viewer를 만듭니다. 서버(ServerViewer)와
// 브라우저 양쪽에서 쓸 수 있도록 next/* 모듈을 가져오지 않습니다.

import { Viewer } from "@/lib/access";
import { SupabaseRepository } from "@/lib/supabaseRepository";

export class ViewerRepository extends SupabaseRepository {
  /** 지금 클라이언트의 로그인 세션 → Viewer. 로그인 안 했으면 Viewer.guest(). */
  async load() {
    if (!this.configured) return Viewer.guest();
    const { data, error } = await this.client.auth.getUser();
    const user = data?.user;
    if (error || !user) return Viewer.guest();

    const fallback = Viewer.signedIn({
      userId: user.id,
      email: user.email || "",
      displayName: user.user_metadata?.name || "",
    });
    // current_viewer()는 0015_auth_viewer.sql의 함수 — 아직 적용 전이면 "회원"으로만 봅니다.
    const context = await this.client.rpc("current_viewer");
    if (context.error || !context.data) return fallback;
    return Viewer.fromContext(context.data, { email: user.email || "" });
  }
}
