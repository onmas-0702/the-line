import { BillingService } from "@/lib/billingServer";

// 연간 1회 결제 결과(일반결제창의 P_NEXT_URL) — 여기서 승인까지 마칩니다(일반결제는 결과 한 번으로 끝남).
// 같은 주문은 한 번만 처리되므로 새로고침해도 다시 결제되지 않아요.
// 팝업이면 부모 창에 결과를 알리고 닫고, 같은 창이면(휴대폰) 결과 화면으로 넘깁니다.
function page(ok, message) {
  const payload = JSON.stringify({ source: "theline-inicis-pay", ok, message });
  const next = `/pricing/complete?${new URLSearchParams(ok ? { result: "ok" } : { result: "fail", message }).toString()}`;
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<p style="font-family:sans-serif;padding:24px;text-align:center">${ok ? "결제를 마쳤어요. 잠시만 기다려 주세요…" : "결제를 마치지 못했어요."}</p>
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
  const form = await request.formData().catch(() => null);
  const fields = form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) : {};
  let result;
  try {
    result = await new BillingService().completeOneTime(fields, {
      clientIp: (request.headers.get("x-forwarded-for") || "").split(",")[0].trim(),
    });
  } catch {
    result = { ok: false, message: "결제를 마무리하지 못했어요. 운영팀에 문의해 주세요." };
  }
  return page(result.ok, result.message);
}
