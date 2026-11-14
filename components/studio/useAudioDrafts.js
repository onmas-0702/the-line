"use client";

// 콘텐츠 제작의 "작업 저장하기" 상태 — 저장한 작업 목록, 지금 이어서 작업 중인 저장본, 저장·불러오기·지우기.
// 실제 저장 방식은 lib/audioDraft.js(AudioDraftRepository·AudioDraftSnapshot·AudioDraftLoader).

import { useEffect, useRef, useState } from "react";
import { AudioDraftLoader, AudioDraftSnapshot } from "@/lib/audioDraft";

/** getMeta(): { title, tagsInput, description, publish } — 지금 화면의 정보, applyMeta(meta): 불러온 정보 넣기 */
export function useAudioDrafts({ repository, workbench, getMeta, applyMeta }) {
  const [drafts, setDrafts] = useState([]);
  const [current, setCurrent] = useState(null); // { id, title, updatedAt } — 이어서 작업 중인 저장본
  const [status, setStatus] = useState({ kind: "idle", message: "" }); // idle | saving | loading | saved | error
  const uploadedRef = useRef(new Map()); // 이미 올린 원본(AudioBuffer → 저장 경로) — 다시 저장할 때 또 올리지 않음

  async function refresh() {
    const result = await repository.list();
    if (result.ok) setDrafts(result.drafts);
    return result;
  }

  useEffect(() => {
    let cancelled = false;
    repository.list().then((result) => {
      if (!cancelled && result.ok) setDrafts(result.drafts);
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  async function save() {
    if (workbench.clips.length === 0) {
      setStatus({ kind: "error", message: "저장할 클립이 없어요. 녹음하거나 파일을 올려주세요." });
      return;
    }
    setStatus({ kind: "saving", message: "작업을 저장하는 중…" });
    const meta = getMeta();
    const snapshot = new AudioDraftSnapshot({
      title: meta.title,
      tagsInput: meta.tagsInput,
      description: meta.description,
      publishAt: meta.publish.toColumn(),
      settings: workbench.settings,
      segments: workbench.segments,
    });
    const result = await repository.save({ draftId: current?.id || null, snapshot, uploaded: uploadedRef.current });
    if (!result.ok) {
      setStatus({ kind: "error", message: `저장하지 못했어요: ${result.reason}` });
      return;
    }
    setCurrent(result.draft);
    workbench.markSaved();
    setStatus({ kind: "saved", message: "" });
    refresh();
  }

  async function load(draft) {
    if (workbench.isDirty && !window.confirm("지금 편집 중인 내용이 저장되지 않았어요. 그래도 불러올까요?")) return;
    setStatus({ kind: "loading", message: `"${draft.title}" 불러오는 중…` });
    try {
      const restored = await AudioDraftLoader.load(draft, repository);
      uploadedRef.current = restored.uploaded;
      workbench.restore(restored);
      applyMeta(restored.meta);
      setCurrent({ id: draft.id, title: draft.title, updatedAt: draft.updatedAt });
      setStatus({ kind: "saved", message: "" });
    } catch (e) {
      setStatus({ kind: "error", message: `불러오지 못했어요: ${e?.message || "알 수 없는 오류"}` });
    }
  }

  async function remove(draft) {
    if (!window.confirm(`"${draft.title}" 저장본을 지울까요? 되돌릴 수 없어요.`)) return;
    const result = await repository.remove(draft);
    if (!result.ok) {
      setStatus({ kind: "error", message: `지우지 못했어요: ${result.reason}` });
      return;
    }
    if (current?.id === draft.id) setCurrent(null);
    refresh();
  }

  /** 업로드를 마친 뒤 — 이어서 작업하던 저장본은 정리합니다. */
  async function finishAfterUpload() {
    const draft = drafts.find((d) => d.id === current?.id);
    if (draft) await repository.remove(draft);
    setCurrent(null);
    uploadedRef.current = new Map();
    setStatus({ kind: "idle", message: "" });
    refresh();
  }

  /** 새 작업 시작(저장본과 연결 끊기). */
  function detach() {
    setCurrent(null);
    uploadedRef.current = new Map();
    setStatus({ kind: "idle", message: "" });
  }

  return { drafts, current, status, save, load, remove, finishAfterUpload, detach };
}
