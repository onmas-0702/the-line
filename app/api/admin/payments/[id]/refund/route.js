import { NextResponse } from "next/server";
import { BillingService } from "@/lib/billingServer";
import { AdminGuard } from "@/lib/memberAdminServer";

// 관리자 — 결제 환불(전액·부분). 환불하면 그 회원의 멤버십은 바로 끝납니다. body: { amount?, reason }
export async function POST(request, { params }) {
  const guard = await AdminGuard.check();
  if (!guard.allowed) return NextResponse.json({ ok: false, message: "관리자만 할 수 있어요." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const clientIp = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const result = await new BillingService().refund(id, { amount: body.amount, reason: String(body.reason || "관리자 환불"), clientIp });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
