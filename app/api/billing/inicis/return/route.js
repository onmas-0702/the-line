import { BillingService } from "@/lib/billingServer";

// 이니시스 카드 등록 결과(returnUrl) — 결과를 확인하고 빌링키를 주문에 저장만 합니다. 여기서는 결제하지 않아요
// (이니시스 경고: 결과 화면 새로고침으로 중복 결제될 수 있음). 결제는 구독 화면이 /api/billing/confirm을 한 번 부를 때.
// 팝업이면 부모 창에 결과를 알리고 닫고, 팝업이 아니면(휴대폰에서 같은 창으로 열린 경우) 결과 화면으로 넘깁니다.
function page(ok, oid, message) {
  const payload = JSON.stringify({ source: "theline-inicis-billing", ok, oid, message });
  const next = `/pricing/complete?${new URLSearchParams(ok ? { step: "confirm", oid } : { result: "fail", message }).toString()}`;
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<p style="font-family:sans-serif;padding:24px;text-align:center">${ok ? "카드 등록을 마쳤어요. 잠시만 기다려 주세요…" : "카드 등록을 마치지 못했어요."}</p>
<script>
(function () {
  var payload = ${payload};
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(payload, window.location.origin);
    window.close();
  } else {
    window.location.replace(${JSON.stringify(next)});
  }
})();
</script></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function POST(request) {
  const raw = await request.text().catch(() => "");
  let result;
  try {
    result = await new BillingService().saveBillingKey(raw);
  } catch {
    result = { ok: false, oid: "", message: "카드 등록 결과를 처리하지 못했어요." };
  }
  return page(result.ok, result.oid, result.message);
}
