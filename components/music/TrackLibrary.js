"use client";

// 배경음악 보관함 하나(관리자 라이브러리 / 내 라이브러리) — 업로드, 악기·분위기 필터,
// 악기별로 묶인 목록, 곡마다 미리듣기·[트랙에 올리기](편집 타임라인의 배경음악 트랙)·분류 변경·삭제.

import { useMemo, useState } from "react";
import { Check, ChevronDown, ListPlus, Pause, Play, Tag, Trash2, Upload } from "lucide-react";
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
    <div className={`rounded-lg border p-2 transition ${selected ? "border-night-700 bg-night-50" : "border-stone-200 bg-white"}`}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-stone-800">{track.name}</span>
            <span
              className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] ${
                classification.isClassified ? "bg-night-100 text-night-800" : "bg-stone-100 text-stone-500"
              }`}
            >
              {classification.label}
            </span>
            {previewing && <span className="ml-1.5 text-[11px] text-night-600">미리듣기 중…</span>}
          </span>
        </div>
        <span className="mt-1 shrink-0 text-xs tabular-nums text-stone-400">{track.duration}</span>
        <button
          type="button"
          onClick={onPreview}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200"
          aria-label={previewing ? "미리듣기 정지" : "미리듣기"}
        >
          {previewing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        {/* 편집 타임라인의 배경음악 트랙에 올리기 / 내리기 */}
        <button
          type="button"
          onClick={onSelect}
          disabled={!track.audioUrl}
          aria-pressed={selected}
          className={`flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
            selected ? "bg-night-700 text-white" : "border border-night-300 text-night-700"
          }`}
          title={!track.audioUrl ? "파일이 없는 곡이라 쓸 수 없어요" : selected ? "누르면 배경음악 트랙에서 내려요" : "편집 타임라인의 배경음악 트랙에 올려요"}
        >
          {selected ? <Check size={13} /> : <ListPlus size={13} />}
          {selected ? "트랙에 올림" : "트랙에 올리기"}
        </button>
        {onReclassify && (
          <button
            type="button"
            onClick={() => {
              setDraft(classification);
              setIsEditing((v) => !v);
            }}
            className="mt-1 shrink-0 text-stone-400 hover:text-night-700"
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
              className="rounded-full bg-night-700 px-3 py-1 text-xs font-medium text-white disabled:bg-stone-300"
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
    <div className="space-y-3 rounded-xl border border-night-200 bg-night-50/60 p-3">
      <div>
        <label className="block text-xs font-medium text-stone-500">이름</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-700 focus:border-night-500 focus:outline-none"
        />
      </div>
      <ClassificationPicker value={classification} onChange={setClassification} />
      {notice && <p className="text-xs text-night-600">{notice}</p>}
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
          className="rounded-full bg-night-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-night-800 disabled:bg-stone-300"
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
  // "전체"는 펼침식 — 곡이 많아져도 자리를 덜 차지하게, 처음엔 접어 둡니다(트랙에 올린 곡만 보임).
  const [isAllOpen, setIsAllOpen] = useState(false);

  const classified = useMemo(
    () => tracks.map((track) => ({ track, classification: TrackClassification.fromTrack(track) })),
    [tracks]
  );
  const hasUnclassified = classified.some((c) => !c.classification.isClassified);
  const selectedCategory = MusicTaxonomy.category(categoryKey);
  const visible = classified.filter((c) => c.classification.matches({ categoryKey, moodId }));
  const isAllView = !categoryKey;
  const isCollapsed = isAllView && !isAllOpen;
  // 접혀 있어도 트랙에 올린 곡은 위에 한 줄로 남겨 둡니다.
  const pinned = isCollapsed ? classified.find((c) => c.track.id === selectedTrackId) || null : null;

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

  function renderRow(track) {
    return (
      <TrackRow
        key={track.id}
        track={track}
        selected={selectedTrackId === track.id}
        onSelect={() => onSelect(selectedTrackId === track.id ? null : track.id)}
        previewing={previewingId === track.id}
        onPreview={() => onPreview(track)}
        onDelete={onDelete ? () => onDelete(track) : null}
        onReclassify={onReclassify ? (classification) => onReclassify(track, classification) : null}
      />
    );
  }

  function pickCategory(key) {
    // 이미 "전체"를 보고 있으면 다시 누를 때마다 펼치기/접기, 다른 분류에서 오면 펼쳐서 보여 줍니다.
    if (!key) setIsAllOpen((open) => (categoryKey ? true : !open));
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
          <span className="inline-flex items-center gap-1.5" aria-label={`전체 ${tracks.length}곡 ${isAllView && isAllOpen ? "접기" : "펼치기"}`}>
            전체
            <span
              className={`min-w-[1.25rem] rounded-full px-1.5 py-px text-center text-[10px] font-semibold tabular-nums ${
                isAllView ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
              }`}
            >
              {tracks.length}
            </span>
            <ChevronDown
              size={13}
              strokeWidth={2.25}
              aria-hidden
              className={`-mr-0.5 transition-transform duration-300 ${isAllView && isAllOpen ? "rotate-180" : ""}`}
            />
          </span>
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

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50/60">
        {tracks.length === 0 && <p className="py-6 text-center text-xs text-stone-400">아직 올린 배경음악이 없습니다.</p>}

        {pinned && (
          <div className="p-2.5 pb-0">
            <p className="mb-1.5 px-0.5 text-[11px] font-semibold text-sky-700">트랙에 올린 곡</p>
            {renderRow(pinned.track)}
          </div>
        )}

        {/* 목록 — "전체"에서는 부드럽게 펼쳐지고 접힙니다(높이를 0fr ↔ 1fr로). */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
            isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          }`}
          aria-hidden={isCollapsed || undefined}
          inert={isCollapsed || undefined}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-3 p-2.5">
              {tracks.length > 0 && visible.length === 0 && (
                <p className="py-4 text-center text-xs text-stone-400">이 분류에 해당하는 배경음악이 없습니다.</p>
              )}
              {groups.map((group) => (
                <div key={group.key}>
                  {isAllView && <p className="mb-1.5 px-0.5 text-[11px] font-semibold text-stone-500">{group.label}</p>}
                  <div className="space-y-1.5">{group.items.map(({ track }) => renderRow(track))}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 펼치기·접기 막대 — "전체"에서만 */}
        {isAllView && tracks.length > 0 && (
          <button
            type="button"
            onClick={() => setIsAllOpen((open) => !open)}
            aria-expanded={isAllOpen}
            className="group/fold flex w-full items-center justify-center gap-1.5 border-t border-stone-200/80 bg-white/70 py-2 text-[11px] font-medium text-stone-500 transition hover:text-night-700"
          >
            {isAllOpen ? "목록 접기" : `${tracks.length}곡 모두 보기`}
            <ChevronDown
              size={14}
              strokeWidth={2}
              aria-hidden
              className={`transition-transform duration-300 group-hover/fold:translate-y-px ${isAllOpen ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>
    </div>
  );
}
