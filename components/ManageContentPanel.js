"use client";

import { useState } from "react";
import { AlertCircle, FileAudio, Pencil, Trash2, X } from "lucide-react";
import ContentCoverPicker from "@/components/ContentCoverPicker";
import ContentThumbnail from "@/components/ContentThumbnail";
import { useChannel } from "@/components/ChannelProvider";
import { TimeFormat } from "@/lib/audio";
import { AudioMetadata, ReplacementAudioFile } from "@/lib/audioStorage";
import { ContentCoverChoice } from "@/lib/contentCover";
import { useAppStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

// 콘텐츠 수정 — 오디오 파일 바꾸기, 배경이미지, 제목·태그·간단한 설명.
// (설교자·교회·성경 본문·카테고리는 입력칸을 없앴고, 이미 저장된 값은 그대로 둡니다.)
function EditForm({ item, onCancel, onSave }) {
  const { repos } = useChannel();
  const [title, setTitle] = useState(item.title || "");
  const [newAudio, setNewAudio] = useState(null); // ReplacementAudioFile
  const [audioError, setAudioError] = useState("");
  const [tagsInput, setTagsInput] = useState((item.tags || []).join(", "));
  const [description, setDescription] = useState(item.description || "");
  const [coverChoice, setCoverChoice] = useState(() => ContentCoverChoice.keep(item));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  /** 배경이미지가 바뀌었으면 저장하고, 화면에 반영할 값을 돌려줍니다(안 바뀌었으면 {}). */
  async function saveCover() {
    if (!coverChoice.isChanged) return { patch: {}, notice: "" };
    const result = await coverChoice.commit(repos.library, { name: title.trim() || item.title });
    const patch = { coverImageUrl: result.displayUrl, coverAssetId: result.cover?.coverAssetId ?? null };
    const pendingNotice = "배경이미지는 DB 업데이트(마이그레이션 0006·0011·0012) 전이라 이 탭에서만 바뀌었어요.";
    if (!isSupabaseConfigured) return { patch, notice: "" };
    // 새 이미지를 보관하지 못했으면 서버의 기존 값은 그대로 두고 이 탭에서만 보여줍니다.
    if (coverChoice.hasImage && !result.cover) return { patch, notice: pendingNotice };
    const saved = await repos.audios.updateCover(item.id, result.cover);
    return { patch, notice: saved.ok ? "" : pendingNotice };
  }

  async function pickAudio(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setAudioError("");
    const { audioFile, error: fileError } = await ReplacementAudioFile.from(file);
    if (fileError) return setAudioError(fileError);
    setNewAudio(audioFile);
  }

  /** 새 오디오 파일을 골랐으면 올리고, 화면에 반영할 값을 돌려줍니다. */
  async function saveAudio() {
    if (!newAudio) return { ok: true, patch: {} };
    const patch = { duration: TimeFormat.duration(newAudio.durationSeconds), durationSeconds: newAudio.durationSeconds };
    if (!isSupabaseConfigured) return { ok: true, patch: { ...patch, previewUrl: newAudio.previewUrl } };
    const result = await repos.audios.replaceAudioFile(item.id, newAudio);
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, patch: { ...patch, previewUrl: result.row.audio_url } };
  }

  async function handleSave() {
    const resolvedTitle = title.trim() || "제목 없는 나눔";
    const tags = AudioMetadata.parseTags(tagsInput);
    const metadata = {
      title: resolvedTitle,
      // 입력칸이 없는 항목은 저장된 값을 그대로 넘겨서 지워지지 않게 합니다.
      pastorName: item.pastorName || "",
      church: item.church || "",
      scriptureReference: item.scriptureReference || "",
      category: item.category || "",
      tags,
      description: description.trim(),
    };
    setIsSaving(true);
    setError("");
    try {
      const audio = await saveAudio();
      if (!audio.ok) {
        setError(`오디오 파일을 바꾸지 못했어요: ${audio.reason}`);
        return;
      }
      if (isSupabaseConfigured) {
        const result = await repos.audios.update(item.id, metadata);
        if (!result.ok) {
          setError(`저장에 실패했어요: ${result.reason}`);
          return;
        }
      }
      const cover = await saveCover();
      onSave({ ...metadata, ...audio.patch, ...cover.patch }, cover.notice);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-lg bg-stone-50 p-3">
      <div>
        <label className="block text-xs font-medium text-stone-500">오디오 파일</label>
        <div className="mt-1 space-y-2 rounded-lg border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">
            {newAudio ? (
              <>
                새 파일: <span className="font-medium text-stone-800">{newAudio.file.name}</span> ·{" "}
                {TimeFormat.duration(newAudio.durationSeconds)} <span className="text-amber-700">(저장하면 바뀌어요)</span>
              </>
            ) : (
              <>지금 파일 · {item.duration}</>
            )}
          </p>
          {(newAudio || item.previewUrl) && (
            <audio
              key={newAudio ? newAudio.previewUrl : "current"}
              controls
              preload="none"
              src={newAudio ? newAudio.previewUrl : item.previewUrl}
              className="h-9 w-full"
            />
          )}
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-400">
              <FileAudio size={14} strokeWidth={1.5} />
              {newAudio ? "다른 파일 고르기" : "새 파일로 바꾸기"}
              <input type="file" accept={ReplacementAudioFile.ACCEPT} onChange={pickAudio} disabled={isSaving} className="hidden" />
            </label>
            {newAudio && (
              <button type="button" onClick={() => setNewAudio(null)} className="text-xs text-stone-400 hover:text-stone-600">
                바꾸지 않기
              </button>
            )}
          </div>
          {audioError && <p className="text-xs text-red-600">{audioError}</p>}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">배경이미지</label>
        <div className="mt-1 rounded-lg border border-stone-200 bg-white p-3">
          <ContentCoverPicker value={coverChoice} onChange={setCoverChoice} disabled={isSaving} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
        />
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
  const { audios, artwork, removeAudioLocal, updateAudioLocal } = useAppStore();
  const { repos } = useChannel();
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleDelete(item) {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`"${item.title}"을(를) 삭제할까요? 이 작업은 되돌릴 수 없어요.`);
      if (!confirmed) return;
    }
    setError("");
    setDeletingId(item.id);
    try {
      if (isSupabaseConfigured) {
        const result = await repos.audios.delete(item.id);
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
      {notice && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <AlertCircle size={14} /> {notice}
        </div>
      )}

      {audios.map((item) => {
        const isEditing = editingId === item.id;
        return (
          <div key={item.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <ContentThumbnail
                item={item}
                imageUrl={artwork.thumbnailFor(item)}
                showDuration={false}
                className="h-14 w-14 shrink-0 rounded-xl p-0"
              />
              <div className="min-w-0 flex-1">
                {(item.pastorName || item.church) && (
                  <p className="truncate text-sm font-medium text-amber-700">
                    {[item.pastorName, item.church].filter(Boolean).join(" · ")}
                  </p>
                )}
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
                onSave={(metadata, saveNotice = "") => {
                  updateAudioLocal(item.id, metadata);
                  setNotice(saveNotice);
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
