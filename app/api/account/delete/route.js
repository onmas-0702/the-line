import { NextResponse } from "next/server";
import { AccountDeletion } from "@/lib/account";
import { ServerSupabase } from "@/lib/supabaseServer";

// 회원 탈퇴 — 마이 페이지 > 계정의 "탈퇴하기"가 부릅니다. 로그인한 사람 본인만 지울 수 있고
// (DB 함수 delete_my_account가 auth.uid()로 확인), 성공하면 로그인 쿠키도 비웁니다.
export async function POST() {
  const client = await ServerSupabase.create();
  const result = await AccountDeletion.run(client);
  if (result.ok) return NextResponse.json({ ok: true });
  const status = result.code === AccountDeletion.Code.NOT_SIGNED_IN ? 401 : result.code === AccountDeletion.Code.FAILED ? 500 : 409;
  return NextResponse.json({ ok: false, code: result.code }, { status });
}
