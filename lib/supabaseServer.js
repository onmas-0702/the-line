// 서버 전용(레이아웃·페이지·라우트 핸들러) — 요청의 쿠키에서 로그인 세션을 읽는
// Supabase 클라이언트와, 지금 요청을 보낸 사람(Viewer)을 만듭니다.
// next/headers를 쓰므로 클라이언트 컴포넌트에서 import하면 안 됩니다.

import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Viewer } from "@/lib/access";
import { SupabaseConfig } from "@/lib/supabaseClient";
import { ViewerRepository } from "@/lib/viewerRepository";

export class ServerSupabase {
  /** 요청마다 새로 만들어야 합니다(요청끼리 세션이 섞이지 않게). 미설정이면 null. */
  static async create() {
    if (!SupabaseConfig.isConfigured) return null;
    const cookieStore = await cookies();
    return createServerClient(SupabaseConfig.URL, SupabaseConfig.ANON_KEY, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // 서버 컴포넌트 렌더 중에는 쿠키를 쓸 수 없습니다. 세션 갱신은 proxy.js가 맡으므로
            // 여기서는 무시해도 됩니다(라우트 핸들러·서버 함수에서는 정상적으로 써집니다).
          }
        },
      },
    });
  }
}

export class PreviewAdminFlag {
  /** 개발 중 스튜디오를 로그인 없이 확인하려면 .env.local에 NEXT_PUBLIC_PREVIEW_ADMIN=true.
   *  로그인을 테스트할 때와 배포 환경에서는 설정하지 마세요. */
  static get isOn() {
    return process.env.NEXT_PUBLIC_PREVIEW_ADMIN === "true";
  }
}

export class ServerViewer {
  /** 이 요청을 보낸 사람. 같은 요청 안에서는 한 번만 조회합니다(React cache). */
  static current = cache(async () => {
    if (PreviewAdminFlag.isOn) return Viewer.previewAdmin();
    const client = await ServerSupabase.create();
    if (!client) return Viewer.guest();
    return new ViewerRepository({ client, configured: true }).load();
  });
}
