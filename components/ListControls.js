"use client";

import { PAGE_SIZE_OPTIONS, SORT_OPTIONS } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";

export default function ListControls({
  sortValue,
  onSortChange,
  totalCount,
  shownCount,
  sortOptions = SORT_OPTIONS,
}) {
  const { pageSize, setPageSize } = useAppStore();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
      <span>
        전체 {totalCount}개 중 {shownCount}개 표시
      </span>
      <div className="flex items-center gap-2">
        {onSortChange && (
          <select
            value={sortValue}
            onChange={(e) => onSortChange(e.target.value)}
            className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-600"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-600">
          표시 개수
          <select
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value)}
            className="bg-transparent focus:outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}개
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
