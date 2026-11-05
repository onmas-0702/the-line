"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useViewer } from "@/components/ViewerProvider";
import { AuthPaths } from "@/lib/auth";
import { MyPageMenu } from "@/lib/myPage";
import { SubscriptionPaths, SubscriptionStatus } from "@/lib/subscription";

export default function MyPageOverview() {
  const viewer = useViewer();
  const status = new SubscriptionStatus(viewer.subscription);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-800">내 정보</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="이름">{viewer.displayName || "-"}</Row>
          <Row label="이메일">{viewer.email || "-"}</Row>
          <Row label="구독">
            {viewer.isSubscriber ? (
              <span className="font-medium text-emerald-700">
                {status.label}
                {status.periodEndLabel && <span className="font-normal text-stone-400"> · {status.periodEndLabel}까지</span>}
              </span>
            ) : (
              <Link href={SubscriptionPaths.PRICING} className="font-medium text-amber-700 hover:underline">
                구독하기
              </Link>
            )}
          </Row>
        </dl>
        <div className="mt-4 flex gap-3 text-xs">
          <Link href={AuthPaths.UPDATE_PASSWORD} className="text-stone-500 hover:underline">
            비밀번호 바꾸기
          </Link>
        </div>
      </section>

      <section className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {MyPageMenu.SECTIONS.map((section) => {
          const gate = section.gateFor(viewer);
          return (
            <Link key={section.key} href={section.path} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50">
              <span>
                <span className="block text-sm font-medium text-stone-800">{section.label}</span>
                <span className="block text-xs text-stone-400">{gate.allowed ? section.description : "구독자 전용 메뉴예요."}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-stone-300" />
            </Link>
          );
        })}
      </section>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-stone-400">{label}</dt>
      <dd className="min-w-0 break-all text-stone-700">{children}</dd>
    </div>
  );
}
