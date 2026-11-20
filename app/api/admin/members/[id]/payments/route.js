import { NextResponse } from "next/server";
import { BillingService } from "@/lib/billingServer";
import { AdminGuard } from "@/lib/memberAdminServer";

// 관리자 — 회원 한 명의 결제 기록.
export async function GET(request, { params }) {
  const guard = await AdminGuard.check();
  if (!guard.allowed) return NextResponse.json({ ok: false, message: "관리자만 볼 수 있어요." }, { status: 403 });
  const { id } = await params;
  const payments = await new BillingService().paymentsFor(id).catch(() => []);
  return NextResponse.json({ ok: true, payments: payments.map((p) => p.toJSON()) });
}
