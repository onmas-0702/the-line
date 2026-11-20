import { NextResponse } from "next/server";
import { BillingService } from "@/lib/billingServer";
import { ServerViewer } from "@/lib/supabaseServer";

// 멤버십 카드 등록 창 열 준비 — 주문을 만들고 이니시스 창에 넣을 값을 돌려줍니다. body: { planCode, buyerTel, isMobile } — 연간은 일반결제창 값
export async function POST(request) {
  const viewer = await ServerViewer.current();
  if (!viewer.isSignedIn || viewer.isPreviewAdmin) return NextResponse.json({ ok: false, message: "로그인한 뒤 결제해 주세요." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await new BillingService().startCheckout({
    userId: viewer.userId,
    planCode: String(body.planCode || ""),
    buyerTel: String(body.buyerTel || ""),
    isMobile: Boolean(body.isMobile),
    origin: new URL(request.url).origin,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
