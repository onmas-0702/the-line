"use client";

// 상단 종 모양 — 구독자에게 새로 공개된 메시지 개수를 보여주고, 누르면 마이 페이지 → 알림으로.
// 개수는 NotificationInbox(공개 시각 > 마지막으로 본 시각)로 계산합니다.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useViewer } from "@/components/ViewerProvider";
import { AccessPolicy } from "@/lib/access";
import { MyPageMenu } from "@/lib/myPage";
import { NotificationRepository } from "@/lib/notifications";

export default function NotificationBell({ className, iconOnly = false, withLabel = false }) {
  const viewer = useViewer();
  const repository = useMemo(() => new NotificationRepository(), []);
  const [badge, setBadge] = useState("");
  const allowed = AccessPolicy.canReceiveNotifications(viewer);

  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    repository.inbox(viewer.userId).then((result) => {
      if (!cancelled && result.ok) setBadge(result.inbox.badge);
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, repository, viewer.userId]);

  if (!allowed) return null;
  const label = badge ? `알림 ${badge}개` : "알림";
  return (
    <Link href={`${MyPageMenu.BASE_PATH}/notifications`} className={`relative ${className}`} aria-label={label} title={label}>
      <Bell size={iconOnly ? 16 : 15} strokeWidth={withLabel ? 1.5 : 2} aria-hidden />
      {withLabel && "알림"}
      {badge && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}
