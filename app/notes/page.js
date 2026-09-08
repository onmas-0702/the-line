"use client";

import { useMemo, useState } from "react";
import { NotebookPen } from "lucide-react";
import ListControls from "@/components/ListControls";
import { deriveTitle, todayLabel } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";

export default function NotesPage() {
  const { notes, audios, addNote, pageSize } = useAppStore();
  const [draft, setDraft] = useState("");
  const [sortValue, setSortValue] = useState("latest");

  function saveDraft() {
    if (!draft.trim()) return;
    addNote({ content: draft });
    setDraft("");
  }

  const sorted = useMemo(() => {
    const copy = [...notes];
    copy.sort((a, b) => (sortValue === "latest" ? (a.date < b.date ? 1 : -1) : a.date > b.date ? 1 : -1));
    return copy;
  }, [notes, sortValue]);

  const visible = sorted.slice(0, pageSize);

  function linkedAudioTitle(audioId) {
    const audio = audios.find((a) => a.id === audioId);
    return audio ? audio.title : null;
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-semibold text-stone-900">영감노트</h1>
        <p className="mt-1 text-sm text-stone-500">
          나눔을 듣다가 떠오른 생각을 빠르게 적어두세요. 첫 줄이 자동으로
          제목이 됩니다. 오디오 카드에서 바로 작성한 노트도 여기 함께
          모입니다.
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="예: 오늘 묵상 중 떠오른 생각…"
          rows={4}
          className="w-full resize-none rounded-lg border border-stone-200 p-3 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-stone-400">
            {draft.trim()
              ? `제목 미리보기: “${deriveTitle(draft)}”`
              : "작성을 시작하면 제목이 자동으로 생성됩니다."}
          </p>
          <button
            type="button"
            onClick={saveDraft}
            className="rounded-full bg-amber-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
          >
            저장
          </button>
        </div>
      </section>

      <ListControls
        sortValue={sortValue}
        onSortChange={setSortValue}
        sortOptions={[
          { value: "latest", label: "최신순" },
          { value: "oldest", label: "오래된순" },
        ]}
        totalCount={sorted.length}
        shownCount={visible.length}
      />

      <section className="space-y-3">
        {visible.map((note) => (
          <div
            key={note.id}
            className="rounded-2xl border border-stone-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">
                {deriveTitle(note.content)}
              </h3>
              <span className="text-xs text-stone-400">{note.date}</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
              {note.content}
            </p>
            {note.audioId && linkedAudioTitle(note.audioId) && (
              <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
                <NotebookPen size={12} /> 관련 오디오: {linkedAudioTitle(note.audioId)}
              </p>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-400">
            아직 작성한 노트가 없습니다.
          </p>
        )}
      </section>
    </div>
  );
}
