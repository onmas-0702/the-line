import { NextResponse } from "next/server";
import { AuthPaths, AuthService, SafeRedirect } from "@/lib/auth";
import { ServerSupabase } from "@/lib/supabaseServer";

// 이메일 인증 링크·소셜 로그인·비밀번호 재설정 메일에서 돌아오는 곳.
// ?code= 를 로그인 세션(쿠키)으로 바꾼 뒤 ?next= 주소로 보냅니다.
export async function GET(request) {
  const url = new URL(request.url);
  const next = SafeRedirect.path(url.searchParams.get("next"));
  const providerError = url.searchParams.get("error_description");

  const client = await ServerSupabase.create();
  const result = providerError
    ? { ok: false, reason: providerError }
    : await new AuthService({ client, configured: Boolean(client) }).exchangeCode(url.searchParams.get("code"));

  if (!result.ok) {
    const loginUrl = new URL(AuthPaths.login(next), url.origin);
    loginUrl.searchParams.set("error", "인증 링크가 만료됐거나 잘못됐어요. 다시 시도해 주세요.");
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
