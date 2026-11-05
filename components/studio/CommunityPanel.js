"use client";

// 스튜디오 → 공지·커뮤니티 탭. 운영자가 구독자에게 보낼 공지를 쓰고, 카카오톡 오픈채팅
// 링크·참여코드를 등록합니다. 구독자는 My Page에서 봅니다.

import { useEffect, useState } from "react";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import { useViewer } from "@/components/ViewerProvider";
import { CommunityInfo, NoticeDraft } from "@/lib/community";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600";

export default function CommunityPanel() {
  if (!isSupabaseConfigured) {
    return <p className="text-sm text-stone-500">서버(Supabase)를 연결하면 공지와 오픈채팅을 관리할 수 있어요.</p>;
  }
  return (
    <div className="space-y-8">
      <NoticeEditor />
      <OpenChatEditor />
    </div>
  );
}

function NoticeEditor() {
  const viewer = useViewer();
  const { repos } = useChannel();
  const [notices, setNotices] = useState([]);
  const [draft, setDraft] = useState(new NoticeDraft());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    repos.notices.list().then((result) => {
      if (!cancelled) setNotices(result.notices);
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  async function post() {
    setBusy(true);
    setMessage("");
    const result = await repos.notices.add(draft, { authorId: viewer.isPreviewAdmin ? null : viewer.userId });
    setBusy(false);
    if (!result.ok) return setMessage(result.reason);
    setNotices((prev) => [result.notice, ...prev].sort((a, b) => Number(b.isPinned) - Number(a.isPinned)));
    setDraft(new NoticeDraft());
    setMessage("공지를 올렸어요. 구독자의 My Page에 보여요.");
  }

  async function togglePin(notice) {
    const result = await repos.notices.update(notice.id, new NoticeDraft({ ...notice, isPinned: !notice.isPinned }));
    if (result.ok) setNotices((prev) => prev.map((n) => (n.id === notice.id ? result.notice : n)));
  }

  async function remove(notice) {
    if (!window.confirm(`"${notice.title}" 공지를 지울까요?`)) return;
    const result = await repos.notices.remove(notice.id);
    if (result.ok) setNotices((prev) => prev.filter((n) => n.id !== notice.id));
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-stone-900">운영자 공지</h2>
      <p className="mt-1 text-sm text-stone-500">구독자에게 전할 소식을 남겨주세요. 고정한 공지는 맨 위에 보여요.</p>
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

function OpenChatEditor() {
  const { repos } = useChannel();
  const [info, setInfo] = useState(new CommunityInfo());
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    repos.community.fetch().then((result) => {
      if (!cancelled && result.ok) setInfo(result.info);
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  async function save() {
    setMessage("");
    const result = await repos.community.save(info);
    setMessage(result.ok ? "저장했어요. 구독자의 My Page → 오픈채팅 참여에 보여요." : result.reason);
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-stone-900">카카오톡 오픈채팅</h2>
      <p className="mt-1 text-sm text-stone-500">
        링크와 참여코드는 구독자에게만 보여요. 링크가 밖으로 퍼질 수 있으니 오픈채팅방에 참여코드를 걸고 가끔 바꿔주세요.
      </p>
      <div className="mt-3 space-y-2 rounded-2xl border border-stone-200 bg-white p-4">
        <input
          value={info.openChatUrl}
          onChange={(e) => setInfo(info.with({ openChatUrl: e.target.value }))}
          placeholder="https://open.kakao.com/o/..."
          className={INPUT}
        />
        <input
          value={info.entryCode}
          onChange={(e) => setInfo(info.with({ entryCode: e.target.value }))}
          placeholder="참여코드(선택)"
          maxLength={20}
          className={INPUT}
        />
        <textarea
          value={info.guide}
          onChange={(e) => setInfo(info.with({ guide: e.target.value }))}
          rows={3}
          maxLength={1000}
          placeholder="참여 안내(선택) — 예: 들어오시면 이름과 교회를 알려주세요."
          className={INPUT}
        />
        <div className="flex justify-end">
          <button type="button" onClick={save} className="rounded-full bg-amber-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800">
            저장
          </button>
        </div>
        {message && <p className="text-xs text-stone-600">{message}</p>}
      </div>
    </section>
  );
}
