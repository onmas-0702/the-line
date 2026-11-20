import { NextResponse } from "next/server";
import { BillingService } from "@/lib/billingServer";
import { ServerViewer } from "@/lib/supabaseServer";

// 멤버십 해지 예약 취소 — 다음 결제일에 다시 자동 결제. 로그인한 본인만.
export async function POST() {
  const viewer = await ServerViewer.current();
  if (!viewer.isSignedIn || viewer.isPreviewAdmin) return NextResponse.json({ ok: false, message: "로그인해 주세요." }, { status: 401 });
  const result = await new BillingService().resume(viewer.userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
