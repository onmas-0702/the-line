import { NextResponse } from "next/server";
import { AdminGuard, MemberAdminService } from "@/lib/memberAdminServer";

// 관리자 페이지 > 회원 관리 — 회원 한 명 정지·정지 풀기. body: { action: "suspend" | "unsuspend", reason?, hideComments? }
export async function POST(request, { params }) {
  const guard = await AdminGuard.check();
  if (!guard.allowed) return NextResponse.json({ ok: false, message: "관리자만 할 수 있어요." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const service = new MemberAdminService();
  try {
    if (body.action === "suspend") {
      const reason = String(body.reason || "").trim();
      if (!reason) return NextResponse.json({ ok: false, message: "정지 사유를 적어 주세요." }, { status: 400 });
      const result = await service.suspend(id, { reason, hideComments: Boolean(body.hideComments), byUserId: guard.viewer.userId });
      return NextResponse.json({ ok: true, member: result.member?.toJSON(), note: result.note });
    }
    if (body.action === "unsuspend") {
      const result = await service.unsuspend(id);
      return NextResponse.json({ ok: true, member: result.member?.toJSON(), note: result.note });
    }
    return NextResponse.json({ ok: false, message: "알 수 없는 요청이에요." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: MemberAdminService.messageFor(error) }, { status: 400 });
  }
}
