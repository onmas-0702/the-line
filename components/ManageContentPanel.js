"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CalendarClock, ChevronDown, Globe, Loader2, Lock, Pencil, Trash2, X } from "lucide-react";
import ContentCoverPicker from "@/components/ContentCoverPicker";
import ContentThumbnail from "@/components/ContentThumbnail";
import { useChannel } from "@/components/ChannelProvider";
import AudioWorkbench from "@/components/studio/AudioWorkbench";
import { useAudioWorkbench } from "@/components/studio/useAudioWorkbench";
import { TimeFormat } from "@/lib/audio";
import { AudioMetadata } from "@/lib/audioStorage";
import { ContentCoverChoice } from "@/lib/contentCover";
import { useAppStore } from "@/lib/store";
import { PublishSchedule } from "@/lib/publishing";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import PublishTimePicker from "@/components/studio/PublishTimePicker";
import ScriptAttachField from "@/components/studio/ScriptAttachField";
import { ScriptChoice } from "@/lib/contentScript";

// 콘텐츠 수정 — 오디오를 제작 화면과 같은 작업대에서 다시 편집(자르기·트리밍·볼륨·배경음악 바꾸기,
// 새 녹음·파일 추가), 배경이미지, 제목·태그·간단한 설명.
// (설교자·교회·성경 본문·카테고리는 입력칸을 없앴고, 이미 저장된 값은 그대로 둡니다.)
function EditForm({ item, onCancel, onSave }) {
  const { repos } = useChannel();
  const [title, setTitle] = useState(item.title || "");
  const workbench = useAudioWorkbench();
  const [loadState, setLoadState] = useState({ status: "loading", hasSeparateVoice: true, error: "" });
  const [tagsInput, setTagsInput] = useState((item.tags || []).join(", "));
  const [description, setDescription] = useState(item.description || "");
  const [coverChoice, setCoverChoice] = useState(() => ContentCoverChoice.keep(item));
  const [script, setScript] = useState(() => ScriptChoice.of(item));
  // 공개 상태 — 공개 · 비공개 · 예약 공개를 언제든 서로 바꿀 수 있어요.
  const [initialPublish] = useState(() => PublishSchedule.forItem(item));
  const [publish, setPublish] = useState(initialPublish);
  const publishChanged = !publish.equals(initialPublish);
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

  // 열 때 저장된 오디오(목소리만 파일이 있으면 그것, 없으면 완성본)와 배경음악 설정을 불러옵니다.
  useEffect(() => {
    let cancelled = false;
    workbench
      .load(item)
      .then((project) => {
        if (!cancelled) setLoadState({ status: "ready", hasSeparateVoice: project.hasSeparateVoice, error: "" });
      })
      .catch((e) => {
        if (!cancelled) setLoadState({ status: "error", hasSeparateVoice: false, error: e?.message || "알 수 없는 오류" });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  /** 대본을 바꾸거나 뺐으면 저장하고, 화면에 반영할 값을 돌려줍니다. */
  async function saveScript() {
    if (!script.isChanged) return { ok: true, patch: {}, notice: "" };
    const file = script.fileToSave;
    const local = {
      hasScript: Boolean(file),
      scriptFileName: file?.name || "",
      scriptUrl: file ? URL.createObjectURL(file) : "",
    };
    if (!isSupabaseConfigured) return { ok: true, patch: local, notice: "" };
    const result = await repos.audios.replaceScript(item.id, file);
    if (!result.ok) return result;
    return {
      ok: true,
      patch: {
        hasScript: Boolean(result.row.has_script),
        scriptFileName: result.row.script_file_name || "",
        scriptUrl: result.row.script_url || "",
      },
      notice: result.cleanupFailed ? "예전 대본 파일을 지우지 못해 저장 공간에 남아 있어요." : "",
    };
  }

  /** 오디오를 바꿨으면 다시 만들어 올리고, 화면에 반영할 값을 돌려줍니다. */
  async function saveAudio() {
    if (!workbench.isDirty) return { ok: true, patch: {}, notice: "" };
    const render = await workbench.render();
    if (!render) return { ok: false, reason: "클립이 하나도 없어요. 녹음하거나 파일을 올려주세요." };
    const patch = { duration: TimeFormat.duration(render.durationSeconds), durationSeconds: render.durationSeconds };
    if (!isSupabaseConfigured) return { ok: true, patch: { ...patch, previewUrl: URL.createObjectURL(render.mixBlob()) }, notice: "" };
    const result = await repos.audios.replaceEditedAudio(item.id, render);
    if (!result.ok) return { ok: false, reason: result.reason };
    return {
      ok: true,
      patch: {
        ...patch,
        previewUrl: result.row.audio_url,
        voiceUrl: result.row.voice_url || null,
        editSettings: result.row.edit_settings || null,
      },
      notice: [
        result.projectSkipped
          ? "오디오는 바뀌었어요. 다만 DB 업데이트(마이그레이션 0020) 전이라 다음에 열면 배경음악이 섞인 채로 불러와요."
          : "",
        result.cleanupFailed ? "예전 소리 파일을 지우지 못해 저장 공간에 남아 있어요(콘텐츠는 새 소리로 바뀌었어요)." : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
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
    if (publishChanged && publish.problem()) {
      setError(publish.problem());
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const audio = await saveAudio();
      if (!audio.ok) {
        setError(`오디오를 저장하지 못했어요: ${audio.reason}`);
        return;
      }
      if (isSupabaseConfigured) {
        const result = await repos.audios.update(item.id, metadata);
        if (!result.ok) {
          setError(`저장에 실패했어요: ${result.reason}`);
          return;
        }
      }
      let publishPatch = {};
      if (publishChanged && isSupabaseConfigured) {
        const result = await repos.audios.updateVisibility(item.id, publish, {
          wasLive: initialPublish.state === PublishSchedule.State.PUBLIC,
        });
        if (!result.ok) {
          setError(`공개 상태를 바꾸지 못했어요: ${result.reason}`);
          return;
        }
        publishPatch = VisibilityPatch.fromRow(result.row);
      } else if (publishChanged) {
        publishPatch = VisibilityPatch.local(publish, item);
      }
      const scriptSaved = await saveScript();
      if (!scriptSaved.ok) {
        setError(`대본을 저장하지 못했어요: ${scriptSaved.reason}`);
        return;
      }
      const cover = await saveCover();
      onSave(
        { ...metadata, ...audio.patch, ...scriptSaved.patch, ...cover.patch, ...publishPatch },
        [audio.notice, scriptSaved.notice, cover.notice].filter(Boolean).join(" ")
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-lg bg-stone-50 p-3">
      <div className="space-y-6 rounded-lg border border-stone-200 bg-white p-3">
        {loadState.status === "loading" ? (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-stone-500">
            <Loader2 size={14} className="animate-spin" /> 오디오를 불러오는 중…
          </p>
        ) : loadState.status === "error" ? (
          <p className="py-6 text-center text-xs text-red-600">오디오를 불러오지 못했어요: {loadState.error}</p>
        ) : (
          <AudioWorkbench
            workbench={workbench}
            defaultInputTab="upload"
            intro={
              <p className={`mt-1 text-xs ${loadState.hasSeparateVoice ? "text-stone-400" : "text-amber-700"}`}>
                {loadState.hasSeparateVoice
                  ? "저장했던 목소리와 배경음악 설정을 그대로 불러왔어요. 바꾼 뒤 아래 저장을 누르면 새로 믹싱돼요."
                  : "이 콘텐츠는 다시 편집 기능 전에 저장돼서 배경음악이 이미 섞여 있어요. 자르기·트리밍·볼륨은 그대로 되지만, 배경음악을 고르면 기존 소리 위에 하나 더 겹쳐요. 한 번 저장하면 다음부터는 목소리만 따로 저장돼요."}
              </p>
            }
          />
        )}
        <p className="text-[11px] text-stone-400">
          지금 {item.duration}
          {workbench.isDirty && <span className="text-night-700"> · 오디오가 바뀌었어요(저장하면 반영돼요)</span>}
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">공개 상태</label>
        <div className="mt-1">
          <PublishTimePicker
            value={publish}
            onChange={setPublish}
            disabled={isSaving}
            nowLabel="공개"
            nowHint={PUBLIC_HINT}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">배경이미지</label>
        <div className="mt-1 rounded-lg border border-stone-200 bg-white p-3">
          <ContentCoverPicker value={coverChoice} onChange={setCoverChoice} disabled={isSaving} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">대본</label>
        <div className="mt-1">
          <ScriptAttachField value={script} onChange={setScript} onReject={setError} disabled={isSaving} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-night-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">태그 (쉼표로 구분)</label>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-night-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">간단한 설명</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 focus:border-night-500 focus:outline-none"
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
          disabled={isSaving || loadState.status === "loading"}
          className="rounded-full bg-night-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-night-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isSaving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

const PUBLIC_HINT = "누구나 볼 수 있어요. 처음 공개될 때 알림을 켠 구독자에게 알림이 가요.";

/** 공개 상태를 바꾼 뒤 화면(스토어)에 반영할 값. */
class VisibilityPatch {
  static fromRow(row) {
    return { publishAt: row.publish_at || "", isPrivate: Boolean(row.is_private) };
  }

  /** Supabase 없이(로컬 미리보기) 쓸 때 — 서버와 같은 규칙으로 계산합니다. */
  static local(schedule, item) {
    const wasLive = PublishSchedule.stateOf(item) === PublishSchedule.State.PUBLIC;
    let publishAt = item.publishAt;
    if (schedule.isScheduled) publishAt = schedule.toColumn();
    else if (!schedule.isPrivate && !wasLive) publishAt = new Date().toISOString();
    return { publishAt, isPrivate: schedule.isPrivate };
  }
}

/** 공개 상태 표시 — 공개(초록) · 비공개(회색 자물쇠) · 예약(호박색 + 공개 시각). 누르면 바로 바꿀 수 있어요. */
const BADGE = {
  [PublishSchedule.State.PUBLIC]: { icon: Globe, tone: "bg-emerald-50 text-emerald-700 ring-emerald-200/70" },
  [PublishSchedule.State.PRIVATE]: { icon: Lock, tone: "bg-stone-100 text-stone-600 ring-stone-200" },
  [PublishSchedule.State.SCHEDULED]: { icon: CalendarClock, tone: "bg-amber-50 text-amber-800 ring-amber-200/70" },
};

function VisibilityBadge({ item, isOpen, onToggle }) {
  const schedule = PublishSchedule.forItem(item);
  const { icon: Icon, tone } = BADGE[schedule.state];
  const text =
    schedule.state === PublishSchedule.State.SCHEDULED
      ? `예약 공개 · ${schedule.label}`
      : schedule.isPrivate
        ? "비공개"
        : "공개";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      title="공개 상태 바꾸기"
      className={`mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition ${tone}`}
    >
      <Icon size={12} className="shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
      <ChevronDown size={12} className={`shrink-0 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
    </button>
  );
}

/** 목록에서 바로 공개 상태만 바꾸는 작은 칸 — 오디오를 불러오지 않아 빠릅니다. */
function VisibilityEditor({ item, onCancel, onSaved }) {
  const { repos } = useChannel();
  const [initial] = useState(() => PublishSchedule.forItem(item));
  const [value, setValue] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const changed = !value.equals(initial);

  async function handleApply() {
    if (!changed) return onCancel();
    if (value.problem()) return setError(value.problem());
    setIsSaving(true);
    setError("");
    try {
      if (!isSupabaseConfigured) return onSaved(VisibilityPatch.local(value, item), value);
      const result = await repos.audios.updateVisibility(item.id, value, {
        wasLive: initial.state === PublishSchedule.State.PUBLIC,
      });
      if (!result.ok) return setError(`공개 상태를 바꾸지 못했어요: ${result.reason}`);
      onSaved(VisibilityPatch.fromRow(result.row), value);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-xl bg-stone-50 p-3">
      <PublishTimePicker value={value} onChange={setValue} disabled={isSaving} nowLabel="공개" nowHint={PUBLIC_HINT} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
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
          onClick={handleApply}
          disabled={isSaving || !changed}
          className="rounded-full bg-night-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-night-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isSaving ? "바꾸는 중…" : "적용"}
        </button>
      </div>
    </div>
  );
}

export default function ManageContentPanel() {
  const { audios, artwork, removeAudioLocal, updateAudioLocal } = useAppStore();
  const { repos } = useChannel();
  const [editingId, setEditingId] = useState(null);
  const [visibilityId, setVisibilityId] = useState(null); // 공개 상태만 바꾸는 칸이 열린 콘텐츠
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleDelete(item) {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `"${item.title}"을(를) 삭제할까요?\n소리·대본 파일과 댓글·좋아요까지 모두 지워지고 되돌릴 수 없어요.`
      );
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
        setNotice(result.cleanupFailed ? "콘텐츠는 지웠지만 일부 파일을 저장 공간에서 지우지 못했어요." : "");
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
      <VisibilityCounts audios={audios} />

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl bg-night-50 px-4 py-3 text-xs text-night-700">
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
                  <p className="truncate text-sm font-medium text-night-700">
                    {[item.pastorName, item.church].filter(Boolean).join(" · ")}
                  </p>
                )}
                <h3 className="mt-0.5 truncate text-base font-semibold text-stone-900">{item.title}</h3>
                <p className="mt-1 text-xs text-stone-400">
                  {item.date} · {item.duration} · 재생 {item.plays}회
                </p>
                <VisibilityBadge
                  item={item}
                  isOpen={visibilityId === item.id}
                  onToggle={() => {
                    setEditingId(null);
                    setVisibilityId(visibilityId === item.id ? null : item.id);
                  }}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setVisibilityId(null);
                    setEditingId(isEditing ? null : item.id);
                  }}
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

            {visibilityId === item.id && !isEditing && (
              <VisibilityEditor
                item={item}
                onCancel={() => setVisibilityId(null)}
                onSaved={(patch, schedule) => {
                  updateAudioLocal(item.id, patch);
                  setNotice(`"${item.title}"을(를) ${schedule.isScheduled ? `${schedule.label}에 공개되도록 예약` : schedule.isPrivate ? "비공개로" : "공개로"} 바꿨어요.`);
                  setVisibilityId(null);
                }}
              />
            )}

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

/** 목록 위 개수 — 전체 · 공개 · 비공개 · 예약. */
function VisibilityCounts({ audios }) {
  const counts = { public: 0, private: 0, scheduled: 0 };
  for (const item of audios) counts[PublishSchedule.stateOf(item)] += 1;
  return (
    <p className="text-xs text-stone-400">
      전체 {audios.length}개 · 공개 {counts.public} · 비공개 {counts.private} · 예약 {counts.scheduled}
    </p>
  );
}
