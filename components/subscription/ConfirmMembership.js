"use client";

// 휴대폰 등에서 팝업 없이 카드 등록을 마치고 돌아왔을 때 — 가입 확정(첫 결제)을 한 번 부르고 결과를 보여 줍니다.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BillingApi } from "@/lib/billing";

export default function ConfirmMembership({ oid }) {
  const router = useRouter();
  const startedRef = useRef(false); // 화면이 두 번 그려져도 한 번만 부르기
  const [error, setError] = useState("");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    BillingApi.confirm(oid).then((result) => {
      if (result.ok) router.replace("/pricing/complete?result=ok");
      else setError(result.message);
    });
  }, [oid, router]);

  if (error) {
    return (
      <p className="text-sm text-rose-600" role="alert">
        {error}
      </p>
    );
  }
  return <p className="text-sm text-stone-500">카드 등록을 마쳤어요. 첫 결제를 진행하고 있어요…</p>;
}
