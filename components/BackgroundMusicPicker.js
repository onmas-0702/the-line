"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Play, Pause, Upload, Trash2, Library, Layers, Filter } from "lucide-react";
import { decodeBlobToBuffer } from "@/lib/audio";
import { uploadBackgroundTrack } from "@/lib/audioStorage";
import { BACKGROUND_GENRES, BACKGROUND_THEMES, officialBackgroundThemes } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

// 장르/테마 태그 하나를 켜고 끄는 작은 알약 버튼 — 업로드 폼의 선택 UI와
// 목록 위 필터 UI가 똑같은 모양을 공유합니다.
function TagToggle({ label, active, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        active
          ? "border-amber-700 bg-amber-700 text-white"
          : "border-stone-300 text-stone-500 hover:bg-stone-100"
      }`}
    >
      {label}
    </button>
  );
}

function TrackRow({ track, selected, onSelect, previewing, onPreview, onDelete }) {
  const tags = [...(track.genres || []), ...(track.themes || [])];
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 transition ${
        selected ? "border-amber-700 bg-amber-50" : "border-stone-200 hover:bg-stone-50"
      }`}
    >
      <input
        type="radio"
        name="bgTrack"
        checked={selected}
        onChange={onSelect}
        className="mt-1 accent-amber-700"
      />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onPreview();
        }}
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200"
        aria-label="미리듣기"
      >
        {previewing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-700">{track.name}</span>
          {previewing && <span className="text-xs text-amber-600">미리듣기 재생 중…</span>}
        </div>
        {tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="mt-1 shrink-0 text-xs text-stone-400">{track.duration}</span>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onDelete();
          }}
          className="mt-1 text-stone-300 hover:text-red-500"
          aria-label="삭제"
        >
          <Trash2 size={13} />
        </button>
      )}
    </label>
  );
}

export default function BackgroundMusicPicker({ selectedTrackId, onSelect, volume = 1 }) {
  const { personalTracks, addPersonalTrack, addPersonalTrackFromRow, deletePersonalTrack } = useAppStore();
  const [activeSection, setActiveSection] = useState("official");
  const [openThemeId, setOpenThemeId] = useState(officialBackgroundThemes[0]?.id ?? null);
  const [previewingId, setPreviewingId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const pendingFileRef = useRef(null);
  // 업로드할 파일을 고른 다음, 장르/테마를 선택하고 나서 실제로 업로드를
  // 진행하는 2단계 흐름입니다 — 파일부터 먼저 골라야 태그를 붙일 대상이
  // 생기기 때문에, 파일 선택 즉시 업로드하지 않고 이 상태에 잠시 담아둡니다.
  const [pendingFileName, setPendingFileName] = useState("");
  const [uploadGenres, setUploadGenres] = useState([]);
  const [uploadThemes, setUploadThemes] = useState([]);
  // 내 라이브러리 목록 위의 장르/테마 필터 — "전체"가 기본입니다.
  const [filterGenre, setFilterGenre] = useState("");
  const [filterTheme, setFilterTheme] = useState("");
  const previewAudioRef = useRef(null);
  const clampedVolume = Math.max(0, Math.min(1, volume));

  // 미리듣기 중에 볼륨 슬라이더를 움직이면 바로 반영되도록 실시간으로
  // 동기화합니다 — "볼륨을 적용한 뒤 미리듣기"가 아니라 미리듣기 중에도
  // 슬라이더를 움직이는 즉시 들리는 소리가 바뀝니다.
  useEffect(() => {
    if (previewAudioRef.current) previewAudioRef.current.volume = clampedVolume;
  }, [clampedVolume]);

  // 재생을 클릭 핸들러 안에서 직접(동기적으로) 호출해야 브라우저의 자동재생
  // 정책에 안전하게 걸리지 않습니다 — useEffect로 늦게 play()를 호출하면
  // 타이밍에 따라 소리가 안 나오는 경우가 있어서 이 방식으로 바꿨습니다.
  function togglePreview(track) {
    const el = previewAudioRef.current;
    if (previewingId === track.id) {
      el?.pause();
      setPreviewingId(null);
      return;
    }
    if (!track.audioUrl || !el) {
      // 실제 파일이 없는(공식 라이브러리·미연결 업로드) 트랙은 라벨만 토글합니다.
      setPreviewingId(track.id);
      return;
    }
    el.pause();
    el.src = track.audioUrl;
    el.currentTime = 0;
    el.volume = clampedVolume;
    el.play().catch(() => {});
    setPreviewingId(track.id);
  }

  function toggleTag(list, setList, tag) {
    setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  }

  function handlePickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    pendingFileRef.current = file;
    setPendingFileName(file.name.replace(/\.[^.]+$/, ""));
    setUploadGenres([]);
    setUploadThemes([]);
    setUploadError("");
  }

  function cancelPendingUpload() {
    pendingFileRef.current = null;
    setPendingFileName("");
    setUploadGenres([]);
    setUploadThemes([]);
  }

  async function confirmUpload() {
    const file = pendingFileRef.current;
    if (!file) return;
    const name = pendingFileName.trim() || file.name.replace(/\.[^.]+$/, "");
    setUploadError("");

    if (!isSupabaseConfigured) {
      addPersonalTrack(name, { genres: uploadGenres, themes: uploadThemes });
      cancelPendingUpload();
      return;
    }

    setIsUploading(true);
    try {
      let durationSeconds = 0;
      try {
        const buffer = await decodeBlobToBuffer(file);
        durationSeconds = buffer.duration;
      } catch (err) {
        // 디코딩에 실패해도 파일 자체는 그대로 업로드합니다 (길이 정보만 0으로).
      }
      const result = await uploadBackgroundTrack({
        file,
        name,
        durationSeconds,
        genres: uploadGenres,
        themes: uploadThemes,
      });
      if (result.ok) {
        addPersonalTrackFromRow(result.row);
        cancelPendingUpload();
      } else {
        setUploadError(`업로드에 실패했어요: ${result.reason}`);
      }
    } finally {
      setIsUploading(false);
    }
  }

  const filteredPersonalTracks = useMemo(() => {
    return personalTracks.filter((t) => {
      if (filterGenre && !(t.genres || []).includes(filterGenre)) return false;
      if (filterTheme && !(t.themes || []).includes(filterTheme)) return false;
      return true;
    });
  }, [personalTracks, filterGenre, filterTheme]);

  const hasActiveFilter = Boolean(filterGenre || filterTheme);

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
            모든 창작자가 함께 쓰는 공용 라이브러리예요. 업로드·삭제는 할 수 없고, 테마별로 묶여
            있어요.
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
                        onPreview={() => togglePreview(track)}
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
            직접 업로드해서 나만 사용하는 배경음악 보관함이에요. 다른 창작자에게는 보이지 않고,
            여기서 자유롭게 추가·삭제할 수 있어요.
          </p>
          {!isSupabaseConfigured && (
            <p className="text-xs text-amber-600">
              서버가 아직 연결되지 않아 지금은 파일명만 이 브라우저에 임시로 기록돼요.
            </p>
          )}
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}

          {/* 업로드할 파일을 고른 다음 장르/테마 태그를 붙이는 단계 */}
          {pendingFileName ? (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <div>
                <label className="block text-xs font-medium text-stone-500">이름</label>
                <input
                  type="text"
                  value={pendingFileName}
                  onChange={(e) => setPendingFileName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-stone-500">장르 (선택)</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {BACKGROUND_GENRES.map((g) => (
                    <TagToggle
                      key={g}
                      label={g}
                      active={uploadGenres.includes(g)}
                      onToggle={() => toggleTag(uploadGenres, setUploadGenres, g)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-stone-500">테마 (선택)</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {BACKGROUND_THEMES.map((t) => (
                    <TagToggle
                      key={t}
                      label={t}
                      active={uploadThemes.includes(t)}
                      onToggle={() => toggleTag(uploadThemes, setUploadThemes, t)}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={cancelPendingUpload}
                  disabled={isUploading}
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmUpload}
                  disabled={isUploading || !pendingFileName.trim()}
                  className="rounded-full bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUploading ? "업로드 중…" : "업로드"}
                </button>
              </div>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 p-2 text-xs text-stone-500 hover:bg-stone-50">
              <Upload size={13} /> 내 라이브러리에 배경음악 업로드
              <input type="file" accept="audio/*" className="hidden" onChange={handlePickFile} />
            </label>
          )}

          {/* 장르/테마 필터 — 태그가 하나라도 붙은 트랙이 있을 때만 의미가 있지만,
              항목이 늘어날 걸 감안해서 항상 보여둡니다. */}
          {personalTracks.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-stone-400">
                <Filter size={12} /> 필터
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterGenre("");
                      setFilterTheme("");
                    }}
                    className="ml-auto text-amber-700 hover:underline"
                  >
                    초기화
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {BACKGROUND_GENRES.map((g) => (
                  <TagToggle
                    key={g}
                    label={g}
                    active={filterGenre === g}
                    onToggle={() => setFilterGenre(filterGenre === g ? "" : g)}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {BACKGROUND_THEMES.map((t) => (
                  <TagToggle
                    key={t}
                    label={t}
                    active={filterTheme === t}
                    onToggle={() => setFilterTheme(filterTheme === t ? "" : t)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5 rounded-xl border border-stone-200 bg-white p-3">
            {personalTracks.length === 0 && (
              <p className="py-4 text-center text-xs text-stone-400">
                아직 업로드한 배경음악이 없습니다.
              </p>
            )}
            {personalTracks.length > 0 && filteredPersonalTracks.length === 0 && (
              <p className="py-4 text-center text-xs text-stone-400">
                이 조건에 맞는 배경음악이 없습니다.
              </p>
            )}
            {filteredPersonalTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                selected={selectedTrackId === track.id}
                onSelect={() => onSelect(track.id)}
                previewing={previewingId === track.id}
                onPreview={() => togglePreview(track)}
                onDelete={() => {
                  deletePersonalTrack(track.id);
                  if (selectedTrackId === track.id) onSelect(null);
                  if (previewingId === track.id) setPreviewingId(null);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 항상 마운트되어 있는 하나의 오디오 엘리먼트 — src/재생은 클릭 핸들러에서
          직접 제어합니다(위 togglePreview 참고). */}
      <audio ref={previewAudioRef} onEnded={() => setPreviewingId(null)} className="hidden" />
    </div>
  );
}
