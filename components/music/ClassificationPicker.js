"use client";

// 배경음악 분류 고르기 — 악기(카테고리)를 먼저 고르면 그 아래 분위기(무드)가 나옵니다.
// 업로드할 때와 "분류 변경"할 때 함께 씁니다. 값은 TrackClassification(불변).

import { MusicTaxonomy, TrackClassification } from "@/lib/musicTaxonomy";

export function Chip({ active, onClick, children, size = "md" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border font-medium transition ${
        size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      } ${active ? "border-amber-700 bg-amber-700 text-white" : "border-stone-300 bg-white text-stone-600 hover:bg-stone-100"}`}
    >
      {children}
    </button>
  );
}

export default function ClassificationPicker({ value, onChange }) {
  const category = value.category;
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-xs font-medium text-stone-500">악기</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {MusicTaxonomy.CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              size="sm"
              active={category?.id === c.id}
              onClick={() => onChange(new TrackClassification(category?.id === c.id ? null : c.id))}
            >
              {c.number} {c.label}
            </Chip>
          ))}
        </div>
      </div>
      {category?.hasMoods && (
        <div>
          <p className="text-xs font-medium text-stone-500">분위기</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {category.moods.map((m) => (
              <Chip
                key={m.id}
                size="sm"
                active={value.mood?.id === m.id}
                onClick={() => onChange(new TrackClassification(category.id, value.mood?.id === m.id ? null : m.id))}
              >
                {m.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
