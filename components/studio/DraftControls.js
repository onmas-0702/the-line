"use client";

// "작업 저장하기" 버튼 줄(오디오·배경음악 트랙 바로 아래)과 "저장한 작업" 목록(콘텐츠 제작 맨 위).

import { useState } from "react";
import { ChevronDown, FolderOpen, Loader2, Save, Trash2 } from "lucide-react";
import { PublishSchedule } from "@/lib/publishing";

function savedLabel(iso) {
  return iso ? PublishSchedule.label(new Date(iso)) : "";
}

export function SaveDraftBar({ drafts, isDirty, hasClips }) {
  const { current, status } = drafts;
  const isBusy = status.kind === "saving" || status.kind === "loading";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <button
        type="button"
        onClick={drafts.save}
        disabled={!hasClips || isBusy}
        className="flex items-center gap-1.5 rounded-full bg-night-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-night-800 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {status.kind === "saving" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {current ? "작업 저장하기(덮어쓰기)" : "작업 저장하기"}
      </button>
      <span className="text-xs text-stone-500">
        {status.kind === "error" ? (
          <span className="text-red-600">{status.message}</span>
        ) : isBusy ? (
          status.message
        ) : current ? (
          <>
            &quot;{current.title}&quot; · {savedLabel(current.updatedAt)} 저장
            {isDirty && <span className="text-amber-700"> · 저장 안 한 변경이 있어요</span>}
          </>
        ) : (
          "업로드와 별개로 지금 편집 상태(클립·자른 위치·볼륨·배경음악·정보)를 저장해 두고 나중에 이어서 작업해요."
        )}
      </span>
    </div>
  );
}

export function SavedDraftsList({ drafts }) {
  const [isOpen, setIsOpen] = useState(true);
  if (drafts.drafts.length === 0) return null;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <FolderOpen size={15} className="text-night-700" /> 저장한 작업 {drafts.drafts.length}개
        </span>
        <ChevronDown size={16} className={`text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <ul className="divide-y divide-stone-100 border-t border-stone-100">
          {drafts.drafts.map((draft) => {
            const isCurrent = drafts.current?.id === draft.id;
            return (
              <li key={draft.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800">
                    {draft.title}
                    {isCurrent && <span className="ml-1.5 text-[11px] font-normal text-night-600">(지금 작업 중)</span>}
                  </p>
                  <p className="text-xs text-stone-400">
                    {savedLabel(draft.updatedAt)} 저장 · 클립 {draft.clipCount}개
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => drafts.load(draft)}
                  disabled={drafts.status.kind === "loading" || drafts.status.kind === "saving"}
                  className="shrink-0 rounded-full border border-night-300 px-3 py-1 text-xs font-medium text-night-700 disabled:opacity-40"
                >
                  불러오기
                </button>
                <button
                  type="button"
                  onClick={() => drafts.remove(draft)}
                  className="shrink-0 rounded-full p-1.5 text-stone-400 hover:text-red-600"
                  aria-label={`${draft.title} 저장본 지우기`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
