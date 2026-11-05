import { NextResponse } from "next/server";
import { AuthService } from "@/lib/auth";
import { ServerSupabase } from "@/lib/supabaseServer";

// 로그아웃 — 메뉴의 로그아웃 버튼(form POST)이 부릅니다. 링크 미리보기 등으로 실수로
// 로그아웃되지 않게 GET은 받지 않습니다.
export async function POST(request) {
  const client = await ServerSupabase.create();
  if (client) await new AuthService({ client, configured: true }).signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
