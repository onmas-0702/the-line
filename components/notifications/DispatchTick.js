"use client";

// 사이트를 열 때 가끔(브라우저당 몇 분에 한 번) 예약 공개 알림 발송을 깨웁니다 — 예약 작업(크론)이
// 없어도 알림이 늦지 않게 하는 보조 장치. 화면에는 아무것도 그리지 않습니다.

import { useEffect } from "react";
import { DispatchTrigger } from "@/lib/notifications";

export default function DispatchTick() {
  useEffect(() => {
    DispatchTrigger.maybeRun();
  }, []);
  return null;
}
