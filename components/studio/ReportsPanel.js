"use client";

// 스튜디오 → 신고 탭. 회원이 신고한 댓글을 확인하고 숨기거나(누구에게도 안 보임) 문제없음으로 넘깁니다.
// 서로 다른 3명이 신고한 댓글은 이미 자동으로 숨겨져 있어요(0026). 숨긴 댓글은 "숨긴 댓글"에서 다시 보이게 할 수 있어요.
// 목록·처리는 CommentReportRepository(lib/moderation.js), 권한은 AccessPolicy.canModerateComments(공지 권한).

import { useCallback, useEffect, useState } from "react";
import { EyeOff, Eye, Flag, RefreshCw } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import { CommentReportRepository } from "@/lib/moderation";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const { Status, Action } = CommentReportRepository;

const VIEWS = Object.freeze([
  { status: Status.OPEN, label: "처리 대기" },
  { status: Status.HIDDEN, label: "숨긴 댓글" },
]);

export default function ReportsPanel() {
  const { repos } = useChannel();
  const [status, setStatus] = useState(Status.OPEN);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await repos.reports.listFor(status);
    setItems(result.items);
    setError(result.ok ? "" : result.reason);
    setIsLoading(false);
  }, [repos, status]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let cancelled = false;
    repos.reports.listFor(status).then((result) => {
      if (cancelled) return;
      setItems(result.items);
      setError(result.ok ? "" : result.reason);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repos, status]);

  async function resolve(item, action) {
    setBusyId(item.commentId);
    const result = await repos.reports.resolve(item.commentId, action);
    setBusyId(null);
    if (!result.ok) return setError(result.reason);
    setItems((list) => list.filter((i) => i.commentId !== item.commentId));
  }

  if (!isSupabaseConfigured) {
    return <p className="text-sm text-stone-500">서버(Supabase)를 연결하면 신고된 댓글을 관리할 수 있어요.</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-stone-900">
          <Flag size={16} className="text-rose-500" /> 댓글 신고
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">
          회원이 신고한 댓글이에요. 되도록 하루 안에 확인해 주세요. 숨기면 아무에게도 보이지 않고, 서로 다른 3명이 신고한 댓글은 먼저
          자동으로 숨겨져요.
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {VIEWS.map((view) => (
          <button
            key={view.status}
            type="button"
            onClick={() => {
              setIsLoading(true);
              setStatus(view.status);
            }}
            aria-pressed={status === view.status}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              status === view.status ? "bg-night-700 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {view.label}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-stone-500 hover:bg-stone-100"
        >
          <RefreshCw size={12} /> 새로고침
        </button>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-stone-400">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-200 py-10 text-center text-sm text-stone-400">
          {status === Status.OPEN ? "처리할 신고가 없어요." : "숨긴 댓글이 없어요."}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.commentId} className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                <span className="font-semibold text-stone-800">{item.authorName}</span>
                {item.audioTitle && <span>· {item.audioTitle}</span>}
                <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">신고 {item.count}건</span>
                {item.isHidden && status === Status.OPEN && (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-500">자동으로 숨겨짐</span>
                )}
                {item.isDeleted && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-500">작성자가 지움</span>}
              </div>
              <p className="mt-2 break-words rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-800">{item.body}</p>
              <p className="mt-2 text-xs text-stone-500">사유: {item.reasonSummary}</p>
              {item.details.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-stone-500">
                  {item.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-end gap-1.5">
                {status === Status.OPEN ? (
                  <>
                    <button
                      type="button"
                      disabled={busyId === item.commentId}
                      onClick={() => resolve(item, Action.DISMISS)}
                      className="flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                      title={item.isHidden ? "문제없는 댓글이면 다시 보이게 하고 신고를 닫아요" : "문제없는 댓글이면 신고만 닫아요"}
                    >
                      <Eye size={13} /> 문제없음
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.commentId}
                      onClick={() => resolve(item, Action.HIDE)}
                      className="flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      <EyeOff size={13} /> 숨기기
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === item.commentId}
                    onClick={() => resolve(item, Action.DISMISS)}
                    className="flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                  >
                    <Eye size={13} /> 다시 보이기
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
