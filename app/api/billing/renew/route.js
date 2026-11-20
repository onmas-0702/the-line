import { NextResponse } from "next/server";
import { BillingService } from "@/lib/billingServer";

// 자동갱신 — Vercel 크론이 매일 부릅니다(vercel.json). CRON_SECRET이 맞는 요청만.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const report = await new BillingService().renewDue();
  return NextResponse.json({ ok: true, ...report });
}
