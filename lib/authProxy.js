// proxy.js(Next 16, 예전 middleware)에서 매 요청마다 로그인 세션을 갱신합니다.
// 서버 컴포넌트는 쿠키를 쓸 수 없어서, 만료된 토큰을 새로 고쳐 쿠키에 다시 써 주는 일은
// 페이지가 그려지기 전인 여기서만 할 수 있습니다.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SupabaseConfig } from "@/lib/supabaseClient";

export class AuthSessionProxy {
  async handle(request) {
    let response = NextResponse.next({ request });
    if (!SupabaseConfig.isConfigured) return response;

    const client = createServerClient(SupabaseConfig.URL, SupabaseConfig.ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers = {}) => {
          // 갱신된 쿠키를 (1) 이번 요청을 그리는 서버 코드와 (2) 브라우저 응답 양쪽에 반영합니다.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    });

    // getUser() 호출이 토큰 만료를 확인하고 필요하면 갱신(setAll)합니다. 이 사이에 다른 코드를
    // 넣지 마세요 — 세션이 엉뚱하게 끊기는 원인이 됩니다.
    await client.auth.getUser();
    return response;
  }
}
