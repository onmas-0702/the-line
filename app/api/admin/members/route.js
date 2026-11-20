import { NextResponse } from "next/server";
import { AdminGuard, MemberAdminService } from "@/lib/memberAdminServer";

// 관리자 페이지 > 회원 관리 — 모든 회원 목록. 운영사 채널 소유자만(AdminGuard).
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await AdminGuard.check();
  if (!guard.allowed) return NextResponse.json({ ok: false, message: "관리자만 볼 수 있어요." }, { status: 403 });
  try {
    const members = await new MemberAdminService().list();
    return NextResponse.json({ ok: true, members: members.map((m) => m.toJSON()) });
  } catch {
    return NextResponse.json({ ok: false, message: "회원 목록을 불러오지 못했어요." }, { status: 500 });
  }
}
