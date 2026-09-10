"use client";

import { Download, FileText } from "lucide-react";

export default function AudioCard({ item }) {
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
          {item.hasScript && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
              <FileText size={11} /> 대본 있음
            </span>
          )}
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

      <div className="mt-3 flex items-center gap-3 text-xs text-stone-400">
        <span>재생 {item.plays}회</span>
        <button
          type="button"
          disabled={!item.hasScript}
          className="ml-auto flex items-center gap-1 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={13} /> 대본 다운로드
        </button>
      </div>
    </div>
  );
}
