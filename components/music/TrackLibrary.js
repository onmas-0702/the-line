"use client";

// 배경음악 보관함 하나(관리자 라이브러리 / 내 라이브러리) — 업로드, 악기·분위기 필터,
// 악기별로 묶인 목록, 곡마다 미리듣기·선택·분류 변경·삭제.

import { useMemo, useState } from "react";
import { Pause, Play, Tag, Trash2, Upload } from "lucide-react";
import ClassificationPicker, { Chip } from "@/components/music/ClassificationPicker";
import { MusicTaxonomy, TrackClassification } from "@/lib/musicTaxonomy";

function TrackRow({ track, selected, onSelect, previewing, onPreview, onDelete, onReclassify }) {
  const classification = TrackClassification.fromTrack(track);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(classification);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setIsSaving(true);
    setError("");
    const result = await onReclassify(draft);
    setIsSaving(false);
    if (result?.ok === false) setError(`바꾸지 못했어요: ${result.reason}`);
    else setIsEditing(false);
  }

  return (
    <div className={`rounded-lg border p-2 transition ${selected ? "border-amber-700 bg-amber-50" : "border-stone-200 bg-white"}`}>
      <div className="flex items-start gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
          <input type="radio" name="bgTrack" checked={selected} onChange={onSelect} className="mt-1.5 accent-amber-700" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-stone-800">{track.name}</span>
            <span
              className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] ${
                classification.isClassified ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-500"
              }`}
            >
              {classification.label}
            </span>
            {previewing && <span className="ml-1.5 text-[11px] text-amber-600">미리듣기 중…</span>}
          </span>
        </label>
        <span className="mt-1 shrink-0 text-xs tabular-nums text-stone-400">{track.duration}</span>
        <button
          type="button"
          onClick={onPreview}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200"
          aria-label={previewing ? "미리듣기 정지" : "미리듣기"}
        >
          {previewing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        {onReclassify && (
          <button
            type="button"
            onClick={() => {
              setDraft(classification);
              setIsEditing((v) => !v);
            }}
            className="mt-1 shrink-0 text-stone-400 hover:text-amber-700"
            aria-label="분류 변경"
            title="분류 변경"
          >
            <Tag size={14} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`"${track.name}"을(를) 라이브러리에서 지울까요?`)) onDelete();
            }}
            className="mt-1 shrink-0 text-stone-300 hover:text-red-500"
            aria-label="삭제"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {isEditing && (
        <div className="mt-2 space-y-2 rounded-lg bg-stone-50 p-2.5">
          <ClassificationPicker value={draft} onChange={setDraft} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600"
            >
              취소
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving}
              className="rounded-full bg-amber-700 px-3 py-1 text-xs font-medium text-white disabled:bg-stone-300"
            >
              {isSaving ? "저장 중…" : "분류 저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadForm({ onUpload, notice }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [classification, setClassification] = useState(() => new TrackClassification());
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setFile(null);
    setName("");
    setClassification(new TrackClassification());
  }

  async function submit() {
    if (!file) return;
    setIsUploading(true);
    setError("");
    const result = await onUpload({ file, name: name.trim(), classification });
    setIsUploading(false);
    if (result?.ok === false) setError(`업로드에 실패했어요: ${result.reason}`);
    else reset();
  }

  if (!file) {
    return (
      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 bg-white p-2.5 text-xs text-stone-500 hover:bg-stone-50">
        <Upload size={13} /> 배경음악 올리기
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            setFile(picked);
            setName(picked.name.replace(/\.[^.]+$/, ""));
          }}
        />
      </label>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div>
        <label className="block text-xs font-medium text-stone-500">이름</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
        />
      </div>
      <ClassificationPicker value={classification} onChange={setClassification} />
      {notice && <p className="text-xs text-amber-600">{notice}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={isUploading}
          className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isUploading || !name.trim()}
          className="rounded-full bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:bg-stone-300"
        >
          {isUploading ? "업로드 중…" : "올리기"}
        </button>
      </div>
    </div>
  );
}

/** tracks: 이 보관함의 곡들. onUpload/onDelete/onReclassify가 없으면 보기 전용. */
export default function TrackLibrary({
  description,
  tracks,
  selectedTrackId,
  onSelect,
  previewingId,
  onPreview,
  onUpload,
  uploadNotice,
  onDelete,
  onReclassify,
}) {
  const [categoryKey, setCategoryKey] = useState("");
  const [moodId, setMoodId] = useState("");

  const classified = useMemo(
    () => tracks.map((track) => ({ track, classification: TrackClassification.fromTrack(track) })),
    [tracks]
  );
  const hasUnclassified = classified.some((c) => !c.classification.isClassified);
  const selectedCategory = MusicTaxonomy.category(categoryKey);
  const visible = classified.filter((c) => c.classification.matches({ categoryKey, moodId }));

  // "전체"일 때는 악기 순서대로 묶어서 보여줍니다(미분류는 맨 뒤).
  const groups = useMemo(() => {
    const order = [...MusicTaxonomy.CATEGORIES.map((c) => c.id), MusicTaxonomy.UNCLASSIFIED];
    return order
      .map((key) => ({
        key,
        label: key === MusicTaxonomy.UNCLASSIFIED ? "미분류" : `${MusicTaxonomy.category(key).number} ${MusicTaxonomy.category(key).label}`,
        items: visible.filter((c) => c.classification.categoryKey === key),
      }))
      .filter((g) => g.items.length > 0);
  }, [visible]);

  function pickCategory(key) {
    setCategoryKey(key);
    setMoodId("");
  }

  return (
    <div className="space-y-2.5">
      {description && <p className="text-xs leading-relaxed text-stone-400">{description}</p>}
      {onUpload && <UploadForm onUpload={onUpload} notice={uploadNotice} />}

      {/* 악기 탭 + (고른 악기의) 분위기 */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip active={!categoryKey} onClick={() => pickCategory("")}>
          전체 {tracks.length}
        </Chip>
        {MusicTaxonomy.CATEGORIES.map((c) => (
          <Chip key={c.id} active={categoryKey === c.id} onClick={() => pickCategory(c.id)}>
            {c.number} {c.label}
          </Chip>
        ))}
        {hasUnclassified && (
          <Chip active={categoryKey === MusicTaxonomy.UNCLASSIFIED} onClick={() => pickCategory(MusicTaxonomy.UNCLASSIFIED)}>
            미분류
          </Chip>
        )}
      </div>
      {selectedCategory?.hasMoods && (
        <div className="flex flex-wrap gap-1.5">
          <Chip size="sm" active={!moodId} onClick={() => setMoodId("")}>
            전체 분위기
          </Chip>
          {selectedCategory.moods.map((m) => (
            <Chip key={m.id} size="sm" active={moodId === m.id} onClick={() => setMoodId(m.id)}>
              {m.label}
            </Chip>
          ))}
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-2.5">
        {tracks.length === 0 && <p className="py-4 text-center text-xs text-stone-400">아직 올린 배경음악이 없습니다.</p>}
        {tracks.length > 0 && visible.length === 0 && (
          <p className="py-4 text-center text-xs text-stone-400">이 분류에 해당하는 배경음악이 없습니다.</p>
        )}
        {groups.map((group) => (
          <div key={group.key}>
            {!categoryKey && <p className="mb-1.5 px-0.5 text-[11px] font-semibold text-stone-500">{group.label}</p>}
            <div className="space-y-1.5">
              {group.items.map(({ track }) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  selected={selectedTrackId === track.id}
                  onSelect={() => onSelect(track.id)}
                  previewing={previewingId === track.id}
                  onPreview={() => onPreview(track)}
                  onDelete={onDelete ? () => onDelete(track) : null}
                  onReclassify={onReclassify ? (classification) => onReclassify(track, classification) : null}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
