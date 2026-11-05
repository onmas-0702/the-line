// Supabase 클라이언트. 앱은 설정 없이도(와이어프레임 모드, localStorage 전용) 돌아가야
// 하므로 환경변수가 없으면 isSupabaseConfigured가 false이고 supabase는 null입니다.
//
// 브라우저에서는 @supabase/ssr의 createBrowserClient를 씁니다 — 로그인 세션을 쿠키에
// 저장하기 때문에 서버(레이아웃·라우트)도 같은 세션을 읽을 수 있고, 모든 저장소
// (SupabaseRepository 상속) 요청에 로그인한 사람의 토큰이 실려서 RLS가 "누가" 보냈는지
// 알 수 있습니다. 서버에서 공개 데이터만 읽을 때는 세션 없는 일반 클라이언트를 씁니다
// (요청별 로그인 세션이 필요한 서버 코드는 lib/supabaseServer.js의 ServerSupabase).

import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export class SupabaseConfig {
  static URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  static ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  static get isConfigured() {
    return Boolean(SupabaseConfig.URL && SupabaseConfig.ANON_KEY);
  }

  static get isBrowser() {
    return typeof window !== "undefined";
  }

  /** 지금 실행 환경에 맞는 기본 클라이언트(미설정이면 null). */
  static createDefaultClient() {
    if (!SupabaseConfig.isConfigured) return null;
    if (SupabaseConfig.isBrowser) {
      // createBrowserClient는 브라우저에서 한 번만 만들고 재사용합니다(싱글턴).
      return createBrowserClient(SupabaseConfig.URL, SupabaseConfig.ANON_KEY);
    }
    return createClient(SupabaseConfig.URL, SupabaseConfig.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
}

export const isSupabaseConfigured = SupabaseConfig.isConfigured;

export const supabase = SupabaseConfig.createDefaultClient();
