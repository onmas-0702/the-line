// 예약 공개된 콘텐츠의 휴대폰 푸시 알림 보내기.
// 부르는 곳: (1) 예약 작업(Supabase pg_cron 등 — docs/multi-channel-architecture.md "예약 공개·알림"),
//           (2) 사이트 방문 때 브라우저가 몇 분에 한 번(DispatchTrigger).
// 콘텐츠마다 한 번만 보내므로(audios.notified_at) 여러 번·동시에 불려도 안전하고, 보낼 것이 없으면 조회 한 번으로 끝납니다.

import { PublicationNotifier, PushConfig } from "@/lib/publicationNotifier";

export const dynamic = "force-dynamic";

async function run() {
  const config = new PushConfig();
  if (!config.isReady) {
    // 키가 아직 없으면 조용히 건너뜁니다(앱 안 알림은 이와 상관없이 동작).
    return Response.json({ ok: false, reason: "not-configured", missing: config.missing }, { status: 200 });
  }
  try {
    const result = await new PublicationNotifier(config).dispatch();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, reason: err?.message || "dispatch failed" }, { status: 500 });
  }
}

export async function POST() {
  return run();
}

export async function GET() {
  return run();
}
