"use client";

// 마이 페이지 → 알림 — (1) 휴대폰 알림 켜기/끄기, (2) 최근 공개된 메시지 목록("새" 표시).
// 이 화면을 열면 지금까지의 알림을 읽은 것으로 표시합니다(상단 종 모양 배지가 사라짐).

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { LoadState, useLoaded, useMyPageRepos } from "@/components/mypage/useMyPageData";
import { useViewer } from "@/components/ViewerProvider";
import { WebPushDevice } from "@/lib/notifications";
import { PublishSchedule } from "@/lib/publishing";

const STATE_MESSAGES = {
  [WebPushDevice.State.UNCONFIGURED]: "휴대폰 알림은 준비 중이에요. 새 메시지는 아래 목록과 상단 종 모양에서 알려드려요.",
  [WebPushDevice.State.UNSUPPORTED]: "이 브라우저는 휴대폰 알림을 받을 수 없어요. 크롬·사파리 등 기본 브라우저에서 열어 주세요.",
  [WebPushDevice.State.NEEDS_INSTALL]:
    "아이폰은 '홈 화면에 추가'한 더 라인 앱으로 열어야 알림을 받을 수 있어요(iOS 16.4 이상). 공유 버튼 → 홈 화면에 추가 후 앱으로 열어 주세요.",
  [WebPushDevice.State.DENIED]: "알림이 차단되어 있어요. 브라우저(또는 휴대폰) 설정에서 이 사이트의 알림을 허용해 주세요.",
};

function PushCard() {
  const viewer = useViewer();
  const repos = useMyPageRepos();
  const [state, setState] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    WebPushDevice.status()
      .then((s) => !cancelled && setState(s.state))
      .catch(() => !cancelled && setState(WebPushDevice.State.UNSUPPORTED));
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setIsBusy(true);
    setMessage("");
    try {
      const result = await WebPushDevice.enable();
      if (!result.ok) {
        setMessage(result.reason);
        setState((await WebPushDevice.status()).state);
        return;
      }
      const saved = await repos.pushSubscriptions.save(viewer.userId, result.subscription, navigator.userAgent);
      if (!saved.ok) {
        await WebPushDevice.disable();
        setMessage(`알림을 켜지 못했어요: ${saved.reason}`);
        return;
      }
      setState(WebPushDevice.State.ON);
      setMessage("이 기기에서 새 메시지 알림을 받아요.");
    } catch (e) {
      setMessage(`알림을 켜지 못했어요: ${e?.message || "알 수 없는 오류"}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function turnOff() {
    setIsBusy(true);
    setMessage("");
    try {
      const { endpoint } = await WebPushDevice.disable();
      if (endpoint) await repos.pushSubscriptions.remove(endpoint);
      setState(WebPushDevice.State.OFF);
      setMessage("이 기기의 알림을 껐어요.");
    } finally {
      setIsBusy(false);
    }
  }

  const isOn = state === WebPushDevice.State.ON;
  const canToggle = state === WebPushDevice.State.ON || state === WebPushDevice.State.OFF;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
            {isOn ? <BellRing size={15} className="text-night-700" /> : <BellOff size={15} className="text-stone-400" />} 휴대폰 알림
          </h2>
          <p className="mt-0.5 text-xs text-stone-500">새 메시지가 공개되는 순간 이 기기로 알려드려요.</p>
        </div>
        {state === null ? (
          <Loader2 size={16} className="animate-spin text-stone-400" />
        ) : canToggle ? (
          <button
            type="button"
            onClick={isOn ? turnOff : turnOn}
            disabled={isBusy}
            aria-pressed={isOn}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
              isOn ? "border border-stone-300 text-stone-600" : "bg-night-700 text-white"
            }`}
          >
            {isBusy ? "잠시만요…" : isOn ? "알림 끄기" : "알림 켜기"}
          </button>
        ) : null}
      </div>
      {STATE_MESSAGES[state] && <p className="mt-2 text-xs leading-relaxed text-amber-700">{STATE_MESSAGES[state]}</p>}
      {message && <p className="mt-2 text-xs text-night-700">{message}</p>}
    </section>
  );
}

export default function NotificationsSection() {
  const viewer = useViewer();
  const repos = useMyPageRepos();
  const { result, isLoading } = useLoaded(() => repos.notifications.inbox(viewer.userId), [repos, viewer.userId]);
  const inbox = result?.inbox;

  // 불러온 뒤 "다 읽음"으로 저장 — 이 화면의 "새" 표시는 그대로 두고, 다음부터 종 배지에서 빠집니다.
  useEffect(() => {
    if (!result?.ok) return;
    repos.notifications.markSeen(viewer.userId);
  }, [result, repos, viewer.userId]);

  return (
    <div className="space-y-4">
      <PushCard />
      <LoadState isLoading={isLoading} result={result} empty={inbox && inbox.items.length === 0 ? "아직 공개된 메시지가 없어요." : null}>
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {inbox?.items.map((item) => {
            const unread = inbox.isUnread(item);
            return (
              <li key={item.id}>
                <Link href={item.href} className="flex items-start gap-3 px-4 py-3 hover:bg-stone-50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-red-500" : "bg-transparent"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${unread ? "font-semibold text-stone-900" : "text-stone-700"}`}>
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-400">
                      {PublishSchedule.label(new Date(item.publishAt))} 공개{item.channelName ? ` · ${item.channelName}` : ""}
                    </span>
                  </span>
                  {unread && <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">새</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </LoadState>
    </div>
  );
}
