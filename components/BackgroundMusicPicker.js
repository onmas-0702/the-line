"use client";

import { useState } from "react";
import { ChevronDown, Play, Pause, Upload, Trash2, Library, Layers } from "lucide-react";
import { officialBackgroundThemes } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";

function TrackRow({ track, selected, onSelect, previewing, onPreview, onDelete }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition ${
        selected ? "border-amber-700 bg-amber-50" : "border-stone-200 hover:bg-stone-50"
      }`}
    >
      <input
        type="radio"
        name="bgTrack"
        checked={selected}
        onChange={onSelect}
        className="accent-amber-700"
      />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onPreview();
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200"
        aria-label="미리듣기"
      >
        {previewing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <span className="flex-1 text-sm text-stone-700">
        {track.name}
        {previewing && <span className="ml-2 text-xs text-amber-600">미리듣기 재생 중…</span>}
      </span>
      <span className="text-xs text-stone-400">{track.duration}</span>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onDelete();
          }}
          className="text-stone-300 hover:text-red-500"
          aria-label="삭제"
        >
          <Trash2 size={13} />
        </button>
      )}
    </label>
  );
}

export default function BackgroundMusicPicker({ selectedTrackId, onSelect }) {
  const { personalTracks, addPersonalTrack, deletePersonalTrack } = useAppStore();
  const [activeSection, setActiveSection] = useState("official");
  const [openThemeId, setOpenThemeId] = useState(officialBackgroundThemes[0]?.id ?? null);
  const [previewingId, setPreviewingId] = useState(null);

  function handleUpload(e) {
    const file = e.target.files?.[0];
    if (file) addPersonalTrack(file.name.replace(/\.[^.]+$/, ""));
    e.target.value = "";
  }

  function togglePreview(id) {
    setPreviewingId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      <div className="flex gap-1 rounded-full bg-stone-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setActiveSection("official")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition ${
            activeSection === "official" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
          }`}
        >
          <Library size={14} /> 공식 라이브러리
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("personal")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition ${
            activeSection === "personal" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
          }`}
        >
          <Layers size={14} /> 내 라이브러리
        </button>
      </div>

      {activeSection === "official" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-stone-400">
            플랫폼이 저작권 문제 없이 공식적으로 제공하는 배경음악입니다. 업로드·삭제는 할 수 없어요.
          </p>
          {officialBackgroundThemes.map((theme) => {
            const isOpen = openThemeId === theme.id;
            return (
              <div key={theme.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenThemeId(isOpen ? null : theme.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-800">{theme.name}</p>
                    <p className="text-xs text-stone-400">{theme.tracks.length}곡</p>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="space-y-1.5 border-t border-stone-100 px-3 pb-3 pt-2">
                    {theme.tracks.map((track) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        selected={selectedTrackId === track.id}
                        onSelect={() => onSelect(track.id)}
                        previewing={previewingId === track.id}
                        onPreview={() => togglePreview(track.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-stone-400">
            직접 업로드해서 나만 사용하는 배경음악 보관함입니다. 여기서 자유롭게 추가·삭제할 수 있어요.
          </p>
          <div className="space-y-1.5 rounded-xl border border-stone-200 bg-white p-3">
            {personalTracks.length === 0 && (
              <p className="py-4 text-center text-xs text-stone-400">
                아직 업로드한 배경음악이 없습니다.
              </p>
            )}
            {personalTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                selected={selectedTrackId === track.id}
                onSelect={() => onSelect(track.id)}
                previewing={previewingId === track.id}
                onPreview={() => togglePreview(track.id)}
                onDelete={() => {
                  deletePersonalTrack(track.id);
                  if (selectedTrackId === track.id) onSelect(null);
                }}
              />
            ))}
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 p-2 text-xs text-stone-500 hover:bg-stone-50">
              <Upload size={13} /> 내 라이브러리에 배경음악 업로드
              <input type="file" accept="audio/*" className="hidden" onChange={handleUpload} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
