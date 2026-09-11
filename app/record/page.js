"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import ClipTimeline from "@/components/ClipTimeline";
import BackgroundMusicPicker from "@/components/BackgroundMusicPicker";
import {
  audioBufferToWavBlob,
  buildContinuousBuffer,
  computeWaveformPeaks,
  decodeBlobToBuffer,
  formatDuration,
} from "@/lib/audio";
import { uploadAudioRecord } from "@/lib/audioStorage";
import { CATEGORY_OPTIONS } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

let clipCounter = 0;
function nextClipId() {
  clipCounter += 1;
  return `clip-${Date.now()}-${clipCounter}`;
}

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

export default function RecordPage() {
  const { addAudio, addAudioFromRow } = useAppStore();

  const [activeTab, setActiveTab] = useState("record");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [inputDevices, setInputDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [micError, setMicError] = useState("");
  const [segments, setSegments] = useState([]);

  const [selectedTrack, setSelectedTrack] = useState("bg1");
  const [musicVolume, setMusicVolume] = useState(35);

  // 메타데이터 — 나중에 검색에 쓰일 수 있도록 기본 항목을 받아둡니다.
  const [title, setTitle] = useState("");
  const [pastorName, setPastorName] = useState("");
  const [church, setChurch] = useState("");
  const [scriptureReference, setScriptureReference] = useState("");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [description, setDescription] = useState("");
  const [scriptFile, setScriptFile] = useState(null);

  const [savedMessage, setSavedMessage] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  // 실제 마이크 목록 (권한을 한 번 허용해야 이름이 표시됩니다).
  useEffect(() => {
    let cancelled = false;
    async function loadDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const mics = devices.filter((d) => d.kind === "audioinput");
        setInputDevices(mics);
        setSelectedDeviceId((prev) => (prev && mics.some((m) => m.deviceId === prev) ? prev : mics[0]?.deviceId || ""));
      } catch (e) {
        // ignore — device list just stays empty, default mic will be used
      }
    }
    loadDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", loadDevices);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearInterval(recordTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function addClipFromBlob(blob, source, name) {
    try {
      const buffer = await decodeBlobToBuffer(blob);
      const id = nextClipId();
      setSegments((prev) => [
        ...prev,
        {
          id,
          type: "clip",
          source,
          name,
          buffer,
          duration: buffer.duration,
          waveform: computeWaveformPeaks(buffer),
        },
      ]);
      setMicError("");
    } catch (e) {
      setMicError("오디오를 처리하는 중 문제가 발생했습니다. 다른 파일이나 기기로 다시 시도해주세요.");
    }
  }

  async function startRecording() {
    setMicError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("이 브라우저에서는 마이크 녹음을 지원하지 않습니다.");
      return;
    }
    try {
      const constraints = {
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || mimeType || "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        await addClipFromBlob(blob, "recorded", `녹음 클립 ${segments.filter((s) => s.type === "clip").length + 1}`);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);

      // Device labels are only visible after permission is granted —
      // refresh the list now that we have it.
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        setInputDevices(devices.filter((d) => d.kind === "audioinput"));
      });
    } catch (err) {
      setMicError("마이크에 접근할 수 없습니다. 브라우저의 마이크 권한을 확인해주세요.");
    }
  }

  function stopRecording() {
    clearInterval(recordTimerRef.current);
    setIsRecording(false);
    mediaRecorderRef.current?.stop();
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function handleUploadClip(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await addClipFromBlob(file, "uploaded", file.name);
  }

  const clipSegments = segments.filter((s) => s.type === "clip");
  const clipCount = clipSegments.length;
  const totalClipSeconds = clipSegments.reduce((sum, s) => sum + (s.duration || 0), 0);

  function resetForm() {
    setSegments([]);
    setTitle("");
    setPastorName("");
    setChurch("");
    setScriptureReference("");
    setCategory("");
    setTagsInput("");
    setDescription("");
    setScriptFile(null);
  }

  async function handleSave() {
    if (clipCount === 0) return;
    setIsSaving(true);
    setSaveError("");
    try {
      // Any remaining gaps are treated as removed for the final export —
      // the same effect as pressing "자동으로 붙이기" before saving.
      const finalBuffer = buildContinuousBuffer(segments, { skipGaps: true });
      if (!finalBuffer) {
        setIsSaving(false);
        return;
      }
      const wavBlob = audioBufferToWavBlob(finalBuffer);
      const resolvedTitle = title.trim() || "제목 없는 나눔";
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (isSupabaseConfigured) {
        const metadata = {
          title: resolvedTitle,
          pastorName: pastorName.trim(),
          church: church.trim(),
          scriptureReference: scriptureReference.trim(),
          category,
          tags,
          description: description.trim(),
          durationSeconds: finalBuffer.duration,
          source: clipSegments.some((s) => s.source === "recorded") ? "recorded" : "uploaded",
        };
        const result = await uploadAudioRecord({ wavBlob, scriptFile, metadata });
        if (result.ok) {
          addAudioFromRow(result.row);
        } else {
          // 서버 저장에 실패해도 방금 만든 결과물을 잃지 않도록, 이 브라우저에만이라도 남겨둡니다.
          setSaveError(`서버 저장에 실패해서 이 브라우저에만 임시로 저장했어요. (${result.reason})`);
          addAudio({
            title: resolvedTitle,
            pastorName: pastorName.trim(),
            church: church.trim(),
            hasScript: Boolean(scriptFile),
            scriptFileName: scriptFile?.name || "",
            duration: formatDuration(finalBuffer.duration),
            previewUrl: URL.createObjectURL(wavBlob),
          });
        }
      } else {
        addAudio({
          title: resolvedTitle,
          pastorName: pastorName.trim() || undefined,
          church: church.trim() || undefined,
          hasScript: Boolean(scriptFile),
          scriptFileName: scriptFile?.name || "",
          duration: formatDuration(finalBuffer.duration),
          previewUrl: URL.createObjectURL(wavBlob),
        });
      }

      setSavedMessage(true);
      resetForm();
      setTimeout(() => setSavedMessage(false), 4000);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-lg font-semibold text-stone-900">녹음 / 믹싱</h1>
        <p className="mt-1 text-sm text-stone-500">
          직접 녹음하거나 파일을 업로드해서 짧은 나눔을 만들어보세요.
        </p>
        {!isSupabaseConfigured && (
          <p className="mt-1 text-xs text-amber-600">
            서버(Supabase)가 아직 연결되지 않아 지금은 이 브라우저에만 임시로 저장됩니다.
          </p>
        )}

        <div className="mt-4 flex gap-1 rounded-full bg-stone-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab("record")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition ${
              activeTab === "record" ? "bg-white shadow-sm text-stone-900" : "text-stone-500"
            }`}
          >
            <Mic size={14} /> 녹음하기
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition ${
              activeTab === "upload" ? "bg-white shadow-sm text-stone-900" : "text-stone-500"
            }`}
          >
            <Upload size={14} /> 파일 업로드
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
          {activeTab === "record" ? (
            <>
              <label className="block text-xs font-medium text-stone-500">
                입력 장치
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                disabled={isRecording}
                className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 disabled:opacity-60"
              >
                {inputDevices.length === 0 && <option value="">기본 마이크</option>}
                {inputDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `마이크 ${i + 1}`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-stone-400">
                USB 마이크가 목록에 없다면 컴퓨터에 먼저 연결한 뒤 녹음을 한 번 시작해보세요. 브라우저가 마이크 접근 권한을 요청합니다.
              </p>

              {micError && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  <AlertCircle size={14} /> {micError}
                </div>
              )}

              <div className="mt-5 flex flex-col items-center gap-3 rounded-xl bg-stone-50 py-8">
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-sm transition ${
                    isRecording ? "bg-red-600 animate-pulse" : "bg-amber-700 hover:bg-amber-800"
                  }`}
                  aria-label={isRecording ? "녹음 중지" : "녹음 시작"}
                >
                  {isRecording ? "■" : "●"}
                </button>
                <p className="text-sm text-stone-600">
                  {isRecording
                    ? `녹음 중… (${formatDuration(recordSeconds)})`
                    : "버튼을 눌러 녹음을 시작하세요"}
                </p>
              </div>
            </>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 py-10 text-sm text-stone-500 hover:bg-stone-50">
              <Upload size={20} />
              오디오 파일을 선택하세요 (.mp3, .wav, .m4a)
              <input type="file" accept="audio/*" className="hidden" onChange={handleUploadClip} />
            </label>
          )}
          {micError && activeTab === "upload" && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              <AlertCircle size={14} /> {micError}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">
          오디오 편집 <span className="text-xs font-normal text-stone-400">(마그네틱 타임라인)</span>
        </h2>
        <div className="mt-3">
          <ClipTimeline segments={segments} onChange={setSegments} />
        </div>
        {clipCount > 0 && (
          <p className="mt-2 text-xs text-stone-400">
            클립 {clipCount}개 · 총 {formatDuration(totalClipSeconds)}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">
          배경음악 선택 &amp; 믹싱
        </h2>
        <div className="mt-3">
          <BackgroundMusicPicker selectedTrackId={selectedTrack} onSelect={setSelectedTrack} />
        </div>

        <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>배경음악 볼륨</span>
            <span>{musicVolume}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={musicVolume}
            onChange={(e) => setMusicVolume(Number(e.target.value))}
            className="mt-2 w-full accent-amber-700"
          />
          <p className="mt-2 text-xs text-stone-400">
            배경음악과의 실제 믹싱(더킹 포함)은 다음 단계로 남아있어요. 지금 저장하면 목소리 녹음/편집 결과가 저장됩니다.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">나눔 정보</h2>
        <p className="mt-1 text-xs text-stone-400">
          아래 정보는 나중에 검색과 분류에 쓰입니다. 제목 외에는 비워둬도 저장할 수 있어요.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-stone-500">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="나눔 제목을 입력하세요"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500">설교자 / 목사님</label>
            <input
              type="text"
              value={pastorName}
              onChange={(e) => setPastorName(e.target.value)}
              placeholder="예: 김은혜 목사"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500">교회</label>
            <input
              type="text"
              value={church}
              onChange={(e) => setChurch(e.target.value)}
              placeholder="예: 새빛교회"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500">성경 본문</label>
            <input
              type="text"
              value={scriptureReference}
              onChange={(e) => setScriptureReference(e.target.value)}
              placeholder="예: 시편 23:1-6"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500">카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
            >
              <option value="">선택 안 함</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-stone-500">태그 (쉼표로 구분)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="예: 순종, 은혜, 위로"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-stone-500">간단한 설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="이 나눔을 한두 문장으로 소개해주세요 (검색에 쓰입니다)"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">대본 첨부</h2>
        <div className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white p-4 text-center">
          <label className="block cursor-pointer text-sm text-stone-500">
            {scriptFile ? (
              <span className="text-amber-700">{scriptFile.name}</span>
            ) : (
              <>녹음에 사용한 대본 파일을 선택하세요 (.txt, .docx, .pdf)</>
            )}
            <input
              type="file"
              className="hidden"
              onChange={(e) => setScriptFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </section>

      {saveError && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle size={16} /> {saveError}
        </div>
      )}

      {savedMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> 저장되었습니다. 홈 화면에서 바로 확인할 수 있어요.
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
        >
          임시 저장
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={clipCount === 0 || isSaving}
          className="rounded-full bg-amber-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isSaving ? "믹싱 중…" : "믹싱하고 공유하기"}
        </button>
      </div>
    </div>
  );
}
