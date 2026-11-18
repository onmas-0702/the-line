"use client";

// 원고 첨부 — 콘텐츠 제작·수정이 함께 씁니다. 끌어다 놓거나 눌러서 고르고, 고른 원고는 뺄 수 있습니다.
// value: ScriptChoice, onChange(ScriptChoice)

import { FileText, X } from "lucide-react";
import FileDropZone from "@/components/common/FileDropZone";
import { FileKind } from "@/lib/fileDrop";

export default function ScriptAttachField({ value, onChange, onReject, disabled = false }) {
  const name = value.shownName;
  return (
    <div>
      <FileDropZone
        kind={FileKind.SCRIPT}
        disabled={disabled}
        onFiles={([file]) => onChange(value.withFile(file))}
        onReject={() => onReject?.("원고는 .txt · .docx · .pdf · .hwp 파일만 첨부할 수 있어요.")}
        className="flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-stone-300 bg-white p-4 text-center text-sm text-stone-500 transition hover:bg-stone-50"
      >
        <FileText size={18} />
        {name ? (
          <span className="text-night-700">{name}</span>
        ) : (
          <>원고 파일을 끌어다 놓거나 눌러서 고르세요 (.txt, .docx, .pdf, .hwp)</>
        )}
        {name && <span className="text-[11px] text-stone-400">다른 파일을 놓으면 바뀌어요</span>}
      </FileDropZone>
      {value.mode === "remove" && (
        <p className="mt-1.5 text-xs text-stone-500">저장하면 원고 &quot;{value.currentName}&quot;이(가) 빠져요.</p>
      )}
      {(name || value.mode === "remove") && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value.cleared())}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700"
        >
          <X size={12} />
          {value.mode === "remove" ? "빼지 않기" : value.mode === "replace" && value.currentName ? "원래 원고로" : "원고 빼기"}
        </button>
      )}
    </div>
  );
}
