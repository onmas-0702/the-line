"use client";

// 마이 페이지 → 운영자 공지. 구독자는 공지를 읽고, 공지를 맡은 운영자(메인 운영자 등)에게는
// 같은 자리가 "공지 작성"이 되어 공지를 쓰고 관리합니다(MyPageMenu의 staffView).

import { useEffect, useMemo, useState } from "react";
import { Pin } from "lucide-react";
import NoticeEditor from "@/components/community/NoticeEditor";
import { LoadState, useLoaded, useMyPageRepos } from "@/components/mypage/useMyPageData";
import { useViewer } from "@/components/ViewerProvider";
import { ChannelRepository, ChannelSlug } from "@/lib/channel";
import { NoticeRepository } from "@/lib/community";
import { MyPageMenu } from "@/lib/myPage";

export default function NoticesSection() {
  const viewer = useViewer();
  const section = MyPageMenu.find("notices");
  return section.isStaffViewFor(viewer) ? <NoticeWriter /> : <NoticeList />;
}

/** 운영자 — 공지를 맡은 채널의 공지 쓰기. 지금은 운영 채널이 하나라서 첫 채널을 씁니다. */
function NoticeWriter() {
  const viewer = useViewer();
  const [channelId, setChannelId] = useState(null);
  const [error, setError] = useState("");
  const firstAllowed = viewer.channelIdsAllowing("community")[0];

  useEffect(() => {
    let cancelled = false;
    // 임시 관리자("*")는 특정 채널이 없어서 기본 채널을 찾아 씁니다.
    const resolve =
      firstAllowed && firstAllowed !== "*"
        ? Promise.resolve({ ok: true, row: { id: firstAllowed } })
        : new ChannelRepository().findBySlug(ChannelSlug.DEFAULT);
    resolve.then((result) => {
      if (cancelled) return;
      if (result.ok && result.row?.id) setChannelId(result.row.id);
      else setError("공지를 쓸 채널을 찾지 못했어요.");
    });
    return () => {
      cancelled = true;
    };
  }, [firstAllowed]);

  const repo = useMemo(() => (channelId ? new NoticeRepository({ channelId }) : null), [channelId]);
  if (error) return <p className="py-8 text-center text-sm text-stone-400">{error}</p>;
  if (!repo) return <p className="py-8 text-center text-sm text-stone-400">불러오는 중…</p>;
  return <NoticeEditor repo={repo} showHeading={false} />;
}

/** 구독자 — 공지 읽기. */
function NoticeList() {
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
