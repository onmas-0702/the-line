"use client";

// 공개 시점 고르기 — [바로 공개] / [예약 공개] + 날짜·시각. 값은 PublishSchedule(불변).
// 예약 시각이 되면 콘텐츠가 자동으로 공개되고, 알림을 켠 구독자에게 알림이 갑니다.

import { CalendarClock, Send } from "lucide-react";
import { PublishSchedule } from "@/lib/publishing";

export default function PublishTimePicker({ value, onChange, disabled = false, nowLabel = "바로 공개" }) {
  const problem = value.problem();
  const options = [
    { key: "now", label: nowLabel, icon: Send, active: !value.isScheduled, pick: () => onChange(PublishSchedule.now()) },
    {
      key: "scheduled",
      label: "예약 공개",
      icon: CalendarClock,
      active: value.isScheduled,
      pick: () => onChange(value.isScheduled ? value : PublishSchedule.suggested()),
    },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1 rounded-full bg-stone-100 p-1 text-sm">
        {options.map(({ key, label, icon: Icon, active, pick }) => (
          <button
            key={key}
            type="button"
            onClick={pick}
            disabled={disabled}
            aria-pressed={active}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition ${
              active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {value.isScheduled && (
        <div className="space-y-1.5">
          <input
            type="datetime-local"
            value={PublishSchedule.toInputValue(value.at)}
            min={PublishSchedule.earliestInputValue()}
            onChange={(e) => onChange(PublishSchedule.fromInputValue(e.target.value))}
            disabled={disabled}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-night-500 focus:outline-none"
          />
          {problem ? (
            <p className="text-xs text-red-600">{problem}</p>
          ) : (
            <p className="text-xs text-night-700">
              <b className="font-semibold">{value.label}</b>에 공개돼요. 그 전에는 운영자에게만 보이고, 공개되면 알림을 켠 구독자에게
              알림이 가요.
            </p>
          )}
        </div>
      )}
      {!value.isScheduled && (
        <p className="text-xs text-stone-400">올리는 즉시 공개되고, 알림을 켠 구독자에게 알림이 가요.</p>
      )}
    </div>
  );
}
