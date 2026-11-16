"use client";

// 공개 상태 고르기 — 동그란 선택 세 줄: [바로 공개] / [비공개] / [예약 공개].
// 예약 공개를 고르면 그 아래에 날짜 칸 · 시각 칸(15분 간격 목록) · "한국 시간" 표시가 펼쳐집니다.
// 값은 PublishSchedule(불변). 날짜·시각 계산은 lib/publishing.js가 한국 시간 기준으로 합니다.
// 예약 시각이 되면 콘텐츠가 자동으로 공개되고, 알림을 켠 구독자에게 알림이 갑니다.

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Clock, Globe } from "lucide-react";
import { PublishSchedule } from "@/lib/publishing";

export default function PublishTimePicker({
  value,
  onChange,
  disabled = false,
  nowLabel = "바로 공개",
  nowHint = "올리는 즉시 공개되고, 알림을 켠 구독자에게 알림이 가요.",
}) {
  const problem = value.problem();

  return (
    <div role="radiogroup" aria-label="공개 시점" className="space-y-2">
      <ChoiceCard
        active={value.state === PublishSchedule.State.PUBLIC}
        title={nowLabel}
        hint={nowHint}
        onPick={() => onChange(PublishSchedule.now())}
        disabled={disabled}
      />
      <ChoiceCard
        active={value.isPrivate}
        title="비공개"
        hint="운영자에게만 보여요. 언제든 다시 공개하거나 예약할 수 있어요."
        onPick={() => onChange(PublishSchedule.private())}
        disabled={disabled}
      />
      <ChoiceCard
        active={value.isScheduled}
        title="예약 공개"
        hint={
          <>
            정한 시각 전에는 <b className="font-semibold text-stone-600">운영자에게만</b> 보여요.
          </>
        }
        onPick={() => onChange(value.isScheduled ? value : PublishSchedule.suggested())}
        disabled={disabled}
      >
        {value.isScheduled && (
          <div className="mt-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <DateField value={value} onChange={onChange} disabled={disabled} />
              <TimeField value={value} onChange={onChange} disabled={disabled} />
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500">
                <Globe size={12} aria-hidden /> 한국 시간
              </span>
            </div>
            {problem ? (
              <p className="text-xs text-red-600">{problem}</p>
            ) : (
              <p className="text-xs text-night-700">
                <b className="font-semibold">{value.label}</b>에 공개되고, 알림을 켠 구독자에게 알림이 가요.
              </p>
            )}
          </div>
        )}
      </ChoiceCard>
    </div>
  );
}

/** 동그란 선택 표시 + 제목 + 설명 한 줄. 고른 쪽은 옅은 남색 바탕. */
function ChoiceCard({ active, title, hint, onPick, disabled, children }) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 transition ${
        active ? "border-night-300 bg-night-50/60" : "border-stone-200 bg-white"
      }`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={onPick}
        disabled={disabled}
        className="flex w-full items-start gap-3 rounded-lg text-left"
      >
        <span
          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition ${
            active ? "border-night-600" : "border-stone-300"
          }`}
          aria-hidden
        >
          <span className={`h-2 w-2 rounded-full bg-night-600 transition ${active ? "scale-100" : "scale-0"}`} />
        </span>
        <span className="min-w-0">
          <span className={`block text-sm font-medium ${active ? "text-stone-900" : "text-stone-700"}`}>{title}</span>
          <span className="mt-0.5 block text-xs text-stone-400">{hint}</span>
        </span>
      </button>
      {children && <div className="pl-[30px]">{children}</div>}
    </div>
  );
}

const FIELD =
  "flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-800 transition focus-within:border-night-500 focus-within:ring-2 focus-within:ring-night-100";

/** 날짜 칸 — 보이는 건 "2026년 11월 17일 (화)", 누르면 기기의 달력이 열립니다. */
function DateField({ value, onChange, disabled }) {
  return (
    <label className={`${FIELD} relative min-w-[11.5rem] flex-1 cursor-pointer`}>
      <CalendarDays size={15} className="shrink-0 text-night-600" aria-hidden />
      <span className="flex-1 tabular-nums">{PublishSchedule.dateLabel(value.dateValue)}</span>
      <ChevronDown size={15} className="shrink-0 text-stone-400" aria-hidden />
      <input
        type="date"
        aria-label="공개 날짜"
        value={value.dateValue}
        min={PublishSchedule.dateValueOf()}
        onChange={(e) => onChange(value.withDate(e.target.value))}
        onClick={(e) => e.currentTarget.showPicker?.()}
        disabled={disabled}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

/** 시각 칸 — 누르면 15분 간격 목록이 아래로 열리고, 고른 시각이 가운데 보입니다. 지난 시각은 흐리게. */
function TimeField({ value, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const boxRef = useRef(null);
  const selectedRef = useRef(null);
  const current = value.minutesOfDay;

  useEffect(() => {
    if (!isOpen) return;
    selectedRef.current?.scrollIntoView({ block: "center" });
    function onPointerDown(e) {
      if (!boxRef.current?.contains(e.target)) setIsOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function pick(minutes) {
    onChange(value.withTime(minutes));
    setIsOpen(false);
  }

  return (
    <div ref={boxRef} className="relative w-[9.5rem]">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="공개 시각"
        className={`${FIELD} w-full ${isOpen ? "border-night-500 ring-2 ring-night-100" : ""}`}
      >
        <Clock size={15} className="shrink-0 text-night-600" aria-hidden />
        <span className="flex-1 text-left tabular-nums">{PublishSchedule.timeLabel(current)}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          aria-label="공개 시각"
          className="absolute left-0 top-full z-20 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg shadow-night-900/10"
        >
          {PublishSchedule.timeSlots().map((minutes) => {
            const selected = minutes === current;
            const tooEarly = value.isTooEarly(minutes);
            return (
              <li key={minutes} role="option" aria-selected={selected} aria-disabled={tooEarly}>
                <button
                  ref={selected ? selectedRef : undefined}
                  type="button"
                  onClick={() => pick(minutes)}
                  disabled={tooEarly}
                  className={`block w-full px-4 py-1.5 text-left text-sm tabular-nums transition ${
                    selected
                      ? "bg-night-50 font-semibold text-night-700"
                      : tooEarly
                        ? "text-stone-300"
                        : "text-stone-700"
                  }`}
                >
                  {PublishSchedule.timeLabel(minutes)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
