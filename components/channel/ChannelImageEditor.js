"use client";

// 채널 이미지(로고·대표이미지) 교체 흐름 — 파일 고르기 → 규격에 맞게 자동으로 자르기
// → 미리보기 → 적용. 채널 페이지의 오버레이 버튼과 제작/관리 → 디자인 탭이 함께 씁니다.

import { useEffect, useState } from "react";
import { Camera, CheckCircle2, Trash2, UploadCloud } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import { ImageSpecError } from "@/lib/imageSpec";
import { useAppStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

/** 하나의 이미지 자리(ChannelImageSlot)를 교체·삭제하는 상태와 동작. */
export function useChannelImageEditor(slot) {
  const { channelImages, setChannelImage, clearChannelImage } = useAppStore();
  const { repos } = useChannel();
  const [pending, setPending] = useState(null); // { blob, url } — 규격에 맞게 다듬은 결과
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  // 미리보기용 blob URL은 바뀌거나 화면을 떠날 때 정리합니다.
  useEffect(() => () => pending && URL.revokeObjectURL(pending.url), [pending]);

  async function pickFile(file) {
    if (!file) return;
    setError("");
    setApplied(false);
    setIsProcessing(true);
    try {
      const blob = await slot.spec.process(file);
      setPending({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setPending(null);
      setError(err instanceof ImageSpecError ? err.message : "이미지를 처리하지 못했어요.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function apply() {
    if (!pending) return;
    setError("");
    setIsApplying(true);
    try {
      if (!isSupabaseConfigured) {
        // 서버 미연결 상태에서는 이 브라우저 탭에서만 보이는 임시 적용입니다.
        setChannelImage(slot, URL.createObjectURL(pending.blob));
      } else {
        const result = await repos.siteSettings.uploadImage(slot, pending.blob);
        if (!result.ok) {
          setError(`적용에 실패했어요: ${result.reason}`);
          return;
        }
        setChannelImage(slot, result.url);
      }
      setApplied(true);
      setPending(null);
    } finally {
      setIsApplying(false);
    }
  }

  return {
    slot,
    currentUrl: channelImages[slot.key],
    pending,
    isBusy: isProcessing || isApplying,
    isProcessing,
    isApplying,
    error,
    applied,
    onInputChange: (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      pickFile(file);
    },
    apply,
    cancel: () => {
      setPending(null);
      setError("");
    },
    remove: () => {
      clearChannelImage(slot);
      setApplied(false);
    },
  };
}

/** 파일 선택 버튼 — <label> 안에 숨긴 input을 넣어서, 누르면 바로 파일 창이 열립니다. */
function PickButton({ editor, className, children, ariaLabel }) {
  return (
    <label
      className={`${className} ${editor.isBusy ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
      aria-label={ariaLabel}
    >
      {children}
      <input type="file" accept={editor.slot.spec.acceptAttribute} className="hidden" onChange={editor.onInputChange} />
    </label>
  );
}

/** 규격 비율 그대로의 미리보기 상자. */
function SlotPreview({ slot, url, className = "" }) {
  return (
    <div
      className={`w-full rounded-xl bg-stone-100 bg-cover bg-center ${className}`}
      style={{ aspectRatio: `${slot.spec.aspectWidth} / ${slot.spec.aspectHeight}`, ...(url ? { backgroundImage: `url(${url})` } : {}) }}
      role="img"
      aria-label={`${slot.label} 미리보기`}
    />
  );
}

/** 이미지 위에 겹쳐 놓는 관리자용 교체/삭제 버튼 + 고른 이미지 확인 창. */
export function ImageEditOverlay({ slot, compact = false, className = "" }) {
  const editor = useChannelImageEditor(slot);
  return (
    <>
      <div className={`absolute flex gap-1.5 ${className}`}>
        <PickButton
          editor={editor}
          ariaLabel={`${slot.label} 변경`}
          className={`flex h-8 items-center justify-center gap-1 rounded-full bg-black/55 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/70 ${
            compact ? "w-8" : "px-2.5"
          }`}
        >
          <Camera size={14} />
          {!compact && (editor.isProcessing ? "맞추는 중…" : "변경")}
        </PickButton>
        {editor.currentUrl && !compact && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`${slot.label}를 지울까요?`)) editor.remove();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70"
            aria-label={`${slot.label} 삭제`}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {(editor.pending || editor.error) && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <p className="text-sm font-semibold text-stone-900">{slot.label} 변경</p>
            {editor.pending && (
              <>
                <p className="mt-1 text-xs text-stone-500">이렇게 들어가요. {slot.spec.ratioLabel}에 맞게 가운데를 기준으로 잘랐어요.</p>
                <SlotPreview slot={slot} url={editor.pending.url} className="mt-3" />
              </>
            )}
            {editor.error && <p className="mt-2 text-xs text-red-600">{editor.error}</p>}
            <div className="mt-4 flex gap-2">
              {editor.pending && (
                <button
                  type="button"
                  onClick={editor.apply}
                  disabled={editor.isApplying}
                  className="flex-1 rounded-full bg-amber-700 py-2 text-sm font-medium text-white transition hover:bg-amber-800 disabled:bg-stone-300"
                >
                  {editor.isApplying ? "적용 중…" : "적용하기"}
                </button>
              )}
              <button
                type="button"
                onClick={editor.cancel}
                disabled={editor.isApplying}
                className="flex-1 rounded-full border border-stone-300 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
              >
                {editor.pending ? "취소" : "닫기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 제작/관리 → 디자인 탭에 놓는 이미지 설정 카드(규격 안내 + 현재/새 이미지 미리보기). */
export function ChannelImagePanel({ slot }) {
  const editor = useChannelImageEditor(slot);
  const previewWidth = slot.spec.aspectWidth === slot.spec.aspectHeight ? "w-32" : "w-full";
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-sm font-medium text-stone-800">채널 {slot.label}</p>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">{slot.description}</p>
      <ul className="mt-3 space-y-0.5 rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
        {slot.spec.guide.map((line) => (
          <li key={line}>· {line}</li>
        ))}
      </ul>

      <div className={`mt-4 flex gap-4 ${previewWidth === "w-full" ? "flex-col" : "items-start"}`}>
        <div className={previewWidth}>
          <SlotPreview slot={slot} url={editor.currentUrl} />
          <p className="mt-1.5 text-center text-[11px] text-stone-400">
            {editor.currentUrl ? `현재 ${slot.label}` : "등록된 이미지 없음"}
          </p>
        </div>
        {editor.pending && (
          <div className={previewWidth}>
            <SlotPreview slot={slot} url={editor.pending.url} />
            <p className="mt-1.5 text-center text-[11px] text-stone-400">새 이미지 (이렇게 들어가요)</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <PickButton
          editor={editor}
          className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
        >
          <UploadCloud size={13} /> {editor.isProcessing ? "이미지 맞추는 중…" : "이미지 선택"}
        </PickButton>
        {editor.pending && (
          <>
            <button
              type="button"
              onClick={editor.apply}
              disabled={editor.isApplying}
              className="rounded-full bg-amber-700 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-amber-800 disabled:bg-stone-300"
            >
              {editor.isApplying ? "적용 중…" : "이 이미지로 적용하기"}
            </button>
            <button
              type="button"
              onClick={editor.cancel}
              disabled={editor.isApplying}
              className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
            >
              취소
            </button>
          </>
        )}
        {!editor.pending && editor.currentUrl && (
          <button
            type="button"
            onClick={editor.remove}
            className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
          >
            <Trash2 size={13} /> {slot.label} 지우기
          </button>
        )}
      </div>

      {editor.error && <p className="mt-3 text-xs text-red-600">{editor.error}</p>}
      {editor.applied && !editor.error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 size={13} /> {slot.label}가 적용됐어요.
        </p>
      )}
    </div>
  );
}
