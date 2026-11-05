"use client";

// 감상일기 — 메시지별로 묶어서 보여줍니다(어떤 메시지를 듣고 무엇을 썼는지).
// 일기 내용·메시지 제목·설교자·성경 본문으로 검색하고, 그 자리에서 고치거나 지울 수 있어요.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Search, Trash2 } from "lucide-react";
import { LoadState, useLoaded, useMyPageRepos } from "@/components/mypage/useMyPageData";
import { Channel } from "@/lib/channel";
import { JournalDraft } from "@/lib/engagement";
import { JournalQuery } from "@/lib/myPage";

export default function JournalSection() {
  const repos = useMyPageRepos();
  const { result, isLoading, setResult } = useLoaded(() => repos.journal.listMine(), [repos]);
  const [query, setQuery] = useState(new JournalQuery());
  const entries = useMemo(() => result?.entries || [], [result]);
  const groups = useMemo(() => JournalQuery.groupByAudio(query.apply(entries)), [query, entries]);

  function replaceEntry(updated) {
    setResult((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => (e.id === updated.id ? updated.withAudio(e.audioRow) : e)),
    }));
  }

  function dropEntry(id) {
    setResult((prev) => ({ ...prev, entries: prev.entries.filter((e) => e.id !== id) }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3.5 py-2">
        <Search size={15} className="shrink-0 text-stone-400" />
        <input
          value={query.text}
          onChange={(e) => setQuery(new JournalQuery(e.target.value))}
          placeholder="일기 내용, 메시지 제목, 성경 본문으로 찾기"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <LoadState
        isLoading={isLoading}
        result={result}
        empty={
          groups.length === 0 &&
          (entries.length === 0 ? "메시지 화면의 '감상일기' 버튼으로 첫 기록을 남겨보세요." : "찾는 일기가 없어요.")
        }
      >
        <ul className="space-y-3">
          {groups.map((group) => (
            <li key={group.audioId || group.entries[0].id} className="rounded-2xl border border-stone-200 bg-white p-4">
              <AudioHeading row={group.audioRow} />
              <ul className="mt-3 space-y-3">
                {group.entries.map((entry) => (
                  <JournalItem key={entry.id} entry={entry} repos={repos} onUpdated={replaceEntry} onRemoved={dropEntry} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </LoadState>
    </div>
  );
}

function AudioHeading({ row }) {
  if (!row) return <p className="text-sm font-medium text-stone-400">삭제된 메시지</p>;
  const slug = row.channel?.slug;
  return (
    <Link href={slug ? Channel.contentHref(slug, row.id) : "#"} className="block hover:underline">
      <p className="text-sm font-semibold text-stone-800">{row.title}</p>
      <p className="text-xs text-stone-400">{[row.pastor_name, row.scripture_reference].filter(Boolean).join(" · ")}</p>
    </Link>
  );
}

function JournalItem({ entry, repos, onUpdated, onRemoved }) {
  const [draft, setDraft] = useState(null); // 고치는 중이면 JournalDraft
  const [error, setError] = useState("");

  async function save() {
    const result = await repos.journal.update(entry.id, draft);
    if (!result.ok) return setError(result.reason);
    onUpdated(result.entry);
    setDraft(null);
    setError("");
  }

  async function remove() {
    if (!window.confirm("이 감상일기를 지울까요? 지우면 되돌릴 수 없어요.")) return;
    const result = await repos.journal.remove(entry.id);
    if (result.ok) onRemoved(entry.id);
  }

  return (
    <li className="border-t border-stone-100 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-400">
          {entry.dateLabel}
          {entry.isEdited && " · 수정됨"}
        </p>
        {!draft && (
          <div className="flex gap-1 text-stone-400">
            <button type="button" onClick={() => setDraft(new JournalDraft(entry.body))} className="p-1 hover:text-stone-700" aria-label="고치기">
              <Pencil size={13} />
            </button>
            <button type="button" onClick={remove} className="p-1 hover:text-red-600" aria-label="지우기">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
      {draft ? (
        <div className="mt-1">
          <textarea
            value={draft.body}
            onChange={(e) => setDraft(new JournalDraft(e.target.value))}
            rows={4}
            maxLength={JournalDraft.MAX_LENGTH}
            className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-600"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="mt-1 flex justify-end gap-2 text-sm">
            <button type="button" onClick={() => setDraft(null)} className="rounded-full px-3 py-1 text-stone-500 hover:bg-stone-100">
              취소
            </button>
            <button type="button" onClick={save} className="rounded-full bg-amber-700 px-3 py-1 font-medium text-white hover:bg-amber-800">
              저장
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{entry.body}</p>
      )}
    </li>
  );
}
