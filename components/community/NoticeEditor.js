"use client";

// 공지 쓰기·고정·지우기 — 스튜디오의 공지 탭과 운영자의 마이 페이지 '공지 작성'이 함께 씁니다.
// repo: 그 채널로 한정된 NoticeRepository

import { useEffect, useState } from "react";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { useViewer } from "@/components/ViewerProvider";
import { NoticeDraft } from "@/lib/community";

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600";

export default function NoticeEditor({ repo, showHeading = true }) {
  const viewer = useViewer();
  const [notices, setNotices] = useState([]);
  const [draft, setDraft] = useState(new NoticeDraft());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    repo.list().then((result) => {
      if (!cancelled) setNotices(result.notices);
    });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  async function post() {
    setBusy(true);
    setMessage("");
    const result = await repo.add(draft, { authorId: viewer.isPreviewAdmin ? null : viewer.userId });
    setBusy(false);
    if (!result.ok) return setMessage(result.reason);
    setNotices((prev) => [result.notice, ...prev].sort((a, b) => Number(b.isPinned) - Number(a.isPinned)));
    setDraft(new NoticeDraft());
    setMessage("공지를 올렸어요. 구독자의 마이 페이지에 보여요.");
  }

  async function togglePin(notice) {
    const result = await repo.update(notice.id, new NoticeDraft({ ...notice, isPinned: !notice.isPinned }));
    if (result.ok) setNotices((prev) => prev.map((n) => (n.id === notice.id ? result.notice : n)));
  }

  async function remove(notice) {
    if (!window.confirm(`"${notice.title}" 공지를 지울까요?`)) return;
    const result = await repo.remove(notice.id);
    if (result.ok) setNotices((prev) => prev.filter((n) => n.id !== notice.id));
  }

  return (
    <section>
      {showHeading && (
        <>
          <h2 className="text-base font-semibold text-stone-900">운영자 공지</h2>
          <p className="mt-1 text-sm text-stone-500">구독자에게 전할 소식을 남겨주세요. 고정한 공지는 맨 위에 보여요.</p>
        </>
      )}
      <div className="mt-3 space-y-2 rounded-2xl border border-stone-200 bg-white p-4">
        <input
          value={draft.title}
          onChange={(e) => setDraft(draft.with({ title: e.target.value }))}
          maxLength={NoticeDraft.TITLE_MAX}
          placeholder="제목"
          className={INPUT}
        />
        <textarea
          value={draft.body}
          onChange={(e) => setDraft(draft.with({ body: e.target.value }))}
          maxLength={NoticeDraft.BODY_MAX}
          rows={5}
          placeholder="내용"
          className={INPUT}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-stone-600">
            <input type="checkbox" checked={draft.isPinned} onChange={(e) => setDraft(draft.with({ isPinned: e.target.checked }))} className="accent-amber-700" />
            맨 위에 고정
          </label>
          <button
            type="button"
            onClick={post}
            disabled={busy}
            className="rounded-full bg-amber-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-60"
          >
            {busy ? "올리는 중…" : "공지 올리기"}
          </button>
        </div>
        {message && <p className="text-xs text-stone-600">{message}</p>}
      </div>

      {notices.length > 0 && (
        <ul className="mt-3 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {notices.map((notice) => (
            <li key={notice.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0">
                <span className="flex items-center gap-1 truncate text-sm text-stone-800">
                  {notice.isPinned && <Pin size={12} className="shrink-0 text-amber-700" />} {notice.title}
                </span>
                <span className="text-xs text-stone-400">{notice.dateLabel}</span>
              </span>
              <span className="flex shrink-0 gap-1 text-stone-400">
                <button type="button" onClick={() => togglePin(notice)} className="p-1 hover:text-stone-700" aria-label={notice.isPinned ? "고정 풀기" : "고정"}>
                  {notice.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <button type="button" onClick={() => remove(notice)} className="p-1 hover:text-red-600" aria-label="지우기">
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
