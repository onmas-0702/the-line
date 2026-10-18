"use client";

// 제작 화면의 배경음악 고르기.
//   · 플랫폼 운영 채널('은혜의 밤, 더 라인'): "관리자 라이브러리" 하나 — 운영자가 올리고
//     관리하는 보관함입니다. 여기 올린 곡은 나중에 공용 자산 라이브러리로 다른 채널과
//     나눌 수 있습니다(lib/library.js).
//   · 다른 채널(추후 유료회원 채널): "공식 라이브러리"(운영 채널이 공개한 공용 곡) +
//     "내 라이브러리"(그 채널이 직접 올린 곡)로 나눕니다.
// 곡은 악기 → 분위기 2단계로 분류합니다(lib/musicTaxonomy.js).

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Layers, Library, ShieldCheck } from "lucide-react";
import TrackLibrary from "@/components/music/TrackLibrary";
import { useChannel } from "@/components/ChannelProvider";
import { AudioEngine } from "@/lib/audio";
import { officialBackgroundThemes } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

class LibrarySection {
  static ADMIN = { id: "admin", label: "관리자 라이브러리", icon: ShieldCheck };
  static OFFICIAL = { id: "official", label: "공식 라이브러리", icon: Library };
  static PERSONAL = { id: "personal", label: "내 라이브러리", icon: Layers };

  /** 채널 종류에 따라 보여줄 보관함들. */
  static for(channel) {
    return channel.isPlatform ? [LibrarySection.ADMIN] : [LibrarySection.OFFICIAL, LibrarySection.PERSONAL];
  }
}

// 다른 채널용 "공식 라이브러리" — 공용 자산 라이브러리 화면을 만들기 전까지는 샘플 목록입니다.
function OfficialSampleLibrary({ selectedTrackId, onSelect }) {
  const [openThemeId, setOpenThemeId] = useState(officialBackgroundThemes[0]?.id ?? null);
  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-400">
        운영 채널이 모든 채널에 공개한 배경음악이에요. 공용 라이브러리가 열리면 여기에 실제 곡이 채워져요.
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
              <span className="text-sm font-medium text-stone-800">{theme.name}</span>
              <ChevronDown size={16} className={`text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="space-y-1 border-t border-stone-100 px-3 pb-3 pt-2">
                {theme.tracks.map((track) => (
                  <label key={track.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                    <input
                      type="radio"
                      name="bgTrack"
                      checked={selectedTrackId === track.id}
                      onChange={() => onSelect(track.id)}
                      className="accent-amber-700"
                    />
                    <span className="flex-1 text-sm text-stone-700">{track.name}</span>
                    <span className="text-xs text-stone-400">{track.duration}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BackgroundMusicPicker({ selectedTrackId, onSelect, volume = 1 }) {
  const { personalTracks, addPersonalTrack, addPersonalTrackFromRow, deletePersonalTrack, updatePersonalTrackTags } =
    useAppStore();
  const { channel, repos } = useChannel();
  const sections = LibrarySection.for(channel);
  const [activeSectionId, setActiveSectionId] = useState(sections[sections.length - 1].id);
  const [previewingId, setPreviewingId] = useState(null);
  const previewAudioRef = useRef(null);
  const clampedVolume = Math.max(0, Math.min(1, volume));
  const activeSection = sections.find((s) => s.id === activeSectionId) || sections[0];

  // 미리듣기 중에 볼륨을 바꾸면 들리는 소리에도 바로 반영합니다.
  useEffect(() => {
    if (previewAudioRef.current) previewAudioRef.current.volume = clampedVolume;
  }, [clampedVolume]);

  // 재생은 클릭 핸들러 안에서 바로 호출해야 브라우저 자동재생 정책에 걸리지 않습니다.
  function togglePreview(track) {
    const el = previewAudioRef.current;
    if (previewingId === track.id) {
      el?.pause();
      setPreviewingId(null);
      return;
    }
    if (!track.audioUrl || !el) {
      setPreviewingId(track.id); // 실제 파일이 없는 트랙은 표시만 바꿉니다.
      return;
    }
    el.pause();
    el.src = track.audioUrl;
    el.currentTime = 0;
    el.volume = clampedVolume;
    el.play().catch(() => {});
    setPreviewingId(track.id);
  }

  async function upload({ file, name, classification }) {
    const tags = classification.toTags();
    const trackName = name || file.name.replace(/\.[^.]+$/, "");
    if (!isSupabaseConfigured) {
      addPersonalTrack(trackName, tags);
      return { ok: true };
    }
    let durationSeconds = 0;
    try {
      durationSeconds = (await AudioEngine.decodeBlob(file)).duration;
    } catch (err) {
      // 길이를 못 읽어도 파일은 그대로 올립니다(길이만 0).
    }
    const result = await repos.backgroundTracks.upload({ file, name: trackName, durationSeconds, ...tags });
    if (result.ok) addPersonalTrackFromRow(result.row);
    return result;
  }

  function remove(track) {
    deletePersonalTrack(track.id);
    if (selectedTrackId === track.id) onSelect(null);
    if (previewingId === track.id) setPreviewingId(null);
  }

  const ownLibraryProps = {
    tracks: personalTracks,
    selectedTrackId,
    onSelect,
    previewingId,
    onPreview: togglePreview,
    onUpload: upload,
    uploadNotice: isSupabaseConfigured ? "" : "서버가 아직 연결되지 않아 지금은 이름만 이 브라우저에 임시로 기록돼요.",
    onDelete: remove,
    onReclassify: (track, classification) => updatePersonalTrackTags(track.id, classification.toTags()),
  };

  return (
    <div>
      {sections.length > 1 ? (
        <div className="flex gap-1 rounded-full bg-stone-100 p-1 text-sm">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSectionId(section.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition ${
                  activeSection.id === section.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
                }`}
              >
                <Icon size={14} /> {section.label}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <ShieldCheck size={15} className="text-amber-700" /> {activeSection.label}
        </p>
      )}

      <div className="mt-3">
        {activeSection.id === LibrarySection.OFFICIAL.id ? (
          <OfficialSampleLibrary selectedTrackId={selectedTrackId} onSelect={onSelect} />
        ) : (
          <TrackLibrary
            {...ownLibraryProps}
            description={
              activeSection.id === LibrarySection.ADMIN.id
                ? "운영 채널의 배경음악 보관함이에요. 악기와 분위기로 분류해서 올리고, 여기 올린 곡은 나중에 공용 라이브러리로 다른 채널과 나눌 수 있어요."
                : "이 채널이 직접 올려서 쓰는 배경음악 보관함이에요. 다른 채널에는 보이지 않아요."
            }
          />
        )}
      </div>

      {/* 항상 같은 자리에 있는 미리듣기용 오디오 — 재생은 위 togglePreview에서 직접 제어합니다. */}
      <audio ref={previewAudioRef} onEnded={() => setPreviewingId(null)} className="hidden" />
    </div>
  );
}
