"use client";

// 스튜디오 맨 위 탭 줄 — 보여줄 탭은 StudioTab.visibleFor가 정합니다.

import { Image as ImageIcon, ListChecks, Megaphone, Mic, Users } from "lucide-react";

const ICONS = { content: Mic, manage: ListChecks, design: ImageIcon, community: Megaphone, staff: Users };

export default function StudioTabBar({ tabs, active, onSelect }) {
  if (tabs.length <= 1) return null;
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 rounded-full bg-stone-100 p-1 text-sm sm:min-w-0">
        {tabs.map((tab) => {
          const Icon = ICONS[tab.key] || Mic;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelect(tab.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 transition ${
                active === tab.key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
              }`}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
