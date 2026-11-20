import { NextResponse } from "next/server";
import { BillingService } from "@/lib/billingServer";
import { ServerViewer } from "@/lib/supabaseServer";

// 가입 확정 — 카드 등록을 마친 본인의 주문을 한 번만 결제(첫 결제)합니다. body: { oid }
export async function POST(request) {
  const viewer = await ServerViewer.current();
  if (!viewer.isSignedIn || viewer.isPreviewAdmin) return NextResponse.json({ ok: false, message: "로그인해 주세요." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await new BillingService().confirm({
    userId: viewer.userId,
    oid: String(body.oid || ""),
    origin: new URL(request.url).origin,
    clientIp: (request.headers.get("x-forwarded-for") || "").split(",")[0].trim(),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
