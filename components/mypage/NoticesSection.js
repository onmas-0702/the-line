"use client";

import { useState } from "react";
import { Pin } from "lucide-react";
import { LoadState, useLoaded, useMyPageRepos } from "@/components/mypage/useMyPageData";

export default function NoticesSection() {
  const repos = useMyPageRepos();
  const { result, isLoading } = useLoaded(() => repos.notices.list(), [repos]);
  const notices = result?.notices || [];
  const [openId, setOpenId] = useState(null);

  return (
    <LoadState isLoading={isLoading} result={result} empty={notices.length === 0 && "아직 공지가 없어요."}>
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {notices.map((notice) => {
          const open = openId === notice.id;
          return (
            <li key={notice.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : notice.id)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
                    {notice.isPinned && <Pin size={13} className="shrink-0 text-amber-700" />}
                    <span className="truncate">{notice.title}</span>
                    {notice.isRecent && <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-800">NEW</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-400">
                    {notice.channelName} · {notice.dateLabel}
                  </span>
                </span>
              </button>
              {open && <p className="whitespace-pre-wrap px-4 pb-4 text-sm leading-relaxed text-stone-700">{notice.body}</p>}
            </li>
          );
        })}
      </ul>
    </LoadState>
  );
}
