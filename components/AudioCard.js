"use client";

import { useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  NotebookPen,
  Trash2,
  FileText,
  Download,
} from "lucide-react";
import { CATEGORIES } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";

export default function AudioCard({ item, context = "feed" }) {
  const { getNoteForAudio, addNote, updateAudio, deleteAudio, toggleSavedToMyPage } =
    useAppStore();

  const note = getNoteForAudio(item.id);
  const [notePanelOpen, setNotePanelOpen] = useState(false);
  const [draftNote, setDraftNote] = useState("");

  function handleSaveNote() {
    if (!draftNote.trim()) return;
    addNote({ content: draftNote, audioId: item.id });
    setDraftNote("");
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-amber-700">
            {item.pastorName} · {item.church}
          </p>
          <h3 className="mt-1 text-base font-semibold text-stone-900">
            {item.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
              {item.category}
            </span>
            {item.hasScript && (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                <FileText size={11} /> 대본
              </span>
            )}
            {note && (
              <button
                type="button"
                onClick={() => setNotePanelOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100"
              >
                <NotebookPen size={11} /> 영감노트
              </button>
            )}
          </div>
        </div>
        <span className="whitespace-nowrap text-xs text-stone-400">
          {item.date}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-700 text-white transition hover:bg-amber-800"
          aria-label="재생"
        >
          ▶
        </button>
        <div className="h-2 flex-1 rounded-full bg-stone-100">
          <div className="h-2 w-1/4 rounded-full bg-amber-300" />
        </div>
        <span className="text-xs text-stone-400">{item.duration}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-400">
        <span>재생 {item.plays}회</span>

        {context === "feed" && item.owner !== "me" && (
          <button
            type="button"
            onClick={() => toggleSavedToMyPage(item.id)}
            className={`flex items-center gap-1 hover:text-amber-700 ${
              item.savedByMe ? "text-amber-700" : ""
            }`}
          >
            {item.savedByMe ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
            {item.savedByMe ? "마이페이지에 담김" : "마이페이지에 담기"}
          </button>
        )}

        <button
          type="button"
          onClick={() => setNotePanelOpen((v) => !v)}
          className="hover:text-amber-700"
        >
          {note ? "노트 보기" : "영감노트 작성"}
        </button>

        {context === "mypage" && (
          <>
            <button type="button" className="flex items-center gap-1 hover:text-amber-700">
              <Download size={13} /> 오디오
            </button>
            {item.hasScript && (
              <button type="button" className="flex items-center gap-1 hover:text-amber-700">
                <Download size={13} /> 대본
              </button>
            )}
            <label className="flex items-center gap-1">
              분류
              <select
                value={item.category}
                onChange={(e) => updateAudio(item.id, { category: e.target.value })}
                className="rounded-full border border-stone-200 bg-white px-1.5 py-0.5 text-xs text-stone-600"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => deleteAudio(item.id)}
              className="ml-auto flex items-center gap-1 text-red-400 hover:text-red-600"
            >
              <Trash2 size={13} /> 삭제
            </button>
          </>
        )}
      </div>

      {notePanelOpen && (
        <div className="mt-3 rounded-xl bg-stone-50 p-3">
          {note && (
            <p className="text-sm leading-relaxed text-stone-600">
              {note.content}
            </p>
          )}
          <div className={note ? "mt-2" : ""}>
            <textarea
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              placeholder="이 나눔을 들으며 떠오른 생각을 적어보세요…"
              rows={2}
              className="w-full resize-none rounded-lg border border-stone-200 bg-white p-2 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
            />
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={handleSaveNote}
                className="rounded-full bg-amber-700 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800"
              >
                노트 추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
