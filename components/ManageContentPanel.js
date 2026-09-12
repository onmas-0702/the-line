"use client";

import { useState } from "react";
import { AlertCircle, Pencil, Trash2, X } from "lucide-react";
import { deleteAudioRecord, updateAudioRecord } from "@/lib/audioStorage";
import { CATEGORY_OPTIONS } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

// 오디오 파일 자체(믹싱 결과)는 다시 편집하지 않고, 검색/분류에 쓰이는
// 메타데이터만 고칠 수 있게 합니다 — 업로드 폼과 같은 항목입니다.
function EditForm({ item, onCancel, onSave }) {
  const [title, setTitle] = useState(item.title || "");
  const [pastorName, setPastorName] = useState(item.pastorName || "");
  const [church, setChurch] = useState(item.church || "");
  const [scriptureReference, setScriptureReference] = useState(item.scriptureReference || "");
  const [category, setCategory] = useState(item.category || "");
  const [tagsInput, setTagsInput] = useState((item.tags || []).join(", "));
  const [description, setDescription] = useState(item.description || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const resolvedTitle = title.trim() || "제목 없는 나눔";
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const metadata = {
      title: resolvedTitle,
      pastorName: pastorName.trim(),
      church: church.trim(),
      scriptureReference: scriptureReference.trim(),
      category,
      tags,
      description: description.trim(),
    };
    setIsSaving(true);
    setError("");
    try {
      if (isSupabaseConfigured) {
        const result = await updateAudioRecord(item.id, metadata);
        if (!result.ok) {
          setError(`저장에 실패했어요: ${result.reason}`);
          return;
        }
      }
      onSave(metadata);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-lg bg-stone-50 p-3">
      <div>
        <label className="block text-xs font-medium text-stone-500">제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-stone-500">설교자 / 목사님</label>
          <input
            value={pastorName}
            onChange={(e) => setPastorName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-500">교회</label>
          <input
            value={church}
            onChange={(e) => setChurch(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-stone-500">성경 본문</label>
          <input
            value={scriptureReference}
            onChange={(e) => setScriptureReference(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-500">카테고리</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
          >
            <option value="">선택 안 함</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">태그 (쉼표로 구분)</label>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">간단한 설명</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isSaving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

export default function ManageContentPanel() {
  const { audios, removeAudioLocal, updateAudioLocal } = useAppStore();
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  async function handleDelete(item) {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`"${item.title}"을(를) 삭제할까요? 이 작업은 되돌릴 수 없어요.`);
      if (!confirmed) return;
    }
    setError("");
    setDeletingId(item.id);
    try {
      if (isSupabaseConfigured) {
        const result = await deleteAudioRecord(item.id);
        if (!result.ok) {
          setError(`삭제에 실패했어요: ${result.reason}`);
          return;
        }
      }
      removeAudioLocal(item.id);
      if (editingId === item.id) setEditingId(null);
    } finally {
      setDeletingId(null);
    }
  }

  if (audios.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
        아직 업로드한 콘텐츠가 없습니다. &quot;콘텐츠 제작&quot; 탭에서 먼저 녹음·업로드해보세요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-400">전체 {audios.length}개</p>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {audios.map((item) => {
        const isEditing = editingId === item.id;
        return (
          <div key={item.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-amber-700">
                  {[item.pastorName, item.church].filter(Boolean).join(" · ") || "정보 없음"}
                </p>
                <h3 className="mt-0.5 truncate text-base font-semibold text-stone-900">{item.title}</h3>
                <p className="mt-1 text-xs text-stone-400">
                  {item.date} · {item.duration} · 재생 {item.plays}회
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditingId(isEditing ? null : item.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                  aria-label={isEditing ? "편집 취소" : "편집"}
                  title={isEditing ? "편집 취소" : "편집"}
                >
                  {isEditing ? <X size={15} /> : <Pencil size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={deletingId === item.id}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="삭제"
                  title="삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {isEditing && (
              <EditForm
                item={item}
                onCancel={() => setEditingId(null)}
                onSave={(metadata) => {
                  updateAudioLocal(item.id, metadata);
                  setEditingId(null);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
