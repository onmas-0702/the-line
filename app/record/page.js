"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Upload, CheckCircle2, AlertCircle, Undo2, Image as ImageIcon, ListChecks } from "lucide-react";
import ClipTimeline from "@/components/ClipTimeline";
import BackgroundMusicPicker from "@/components/BackgroundMusicPicker";
import DesignSkinPanel from "@/components/DesignSkinPanel";
import ManageContentPanel from "@/components/ManageContentPanel";
import {
  BG_DUCK_LEAD_SECONDS,
  BG_FADE_OUT_SECONDS,
  DEFAULT_VOICE_OFFSET_SECONDS,
  audioBufferToWavBlob,
  barsForDuration,
  buildContinuousBuffer,
  computeWaveformPeaks,
  decodeBlobToBuffer,
  decodeUrlToBuffer,
  formatDuration,
  mixVoiceWithBackground,
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
  const { addAudio, addAudioFromRow, personalTracks } = useAppStore();

  // 페이지 최상단 탭: 제작(녹음/편집/저장) / 콘텐츠 관리(업로드한 것 삭제·편집) /
  // 디자인(전체 배경 스킨).
  const [mainTab, setMainTab] = useState("content");
  const [activeTab, setActiveTab] = useState("record");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [inputDevices, setInputDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [micError, setMicError] = useState("");
  const [isPreparingMic, setIsPreparingMic] = useState(false);
  const [segments, setSegments] = useState([]);

  const [selectedTrack, setSelectedTrack] = useState("bg1");
  // 배경음악 볼륨 — 나레이션 클립의 볼륨 게인과 완전히 같은 척도입니다
  // (0~2, 기본값 1 = 원본 그대로/중앙). 편집 타임라인 안의 배경음악 트랙
  // 세로선을 드래그해서 조절해요.
  const [musicVolume, setMusicVolume] = useState(1);
  // 배경음악이 먼저 나오고 목소리가 이어서 시작하기까지의 인트로 길이(초).
  // 편집 타임라인의 하늘색 구간을 드래그하면 이 값이 바뀝니다.
  const [voiceOffsetSeconds, setVoiceOffsetSeconds] = useState(DEFAULT_VOICE_OFFSET_SECONDS);

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
  const [bgMixError, setBgMixError] = useState("");

  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const micPrepTimeoutRef = useRef(null);
  // segments 변경 이력을 스택으로 쌓아둬서 실행 취소를 여러 번 계속 누를 수
  // 있게 합니다(이론상 메모리가 허용하는 한 무제한).
  const historyRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);

  // segments를 바꾸는 모든 경로(녹음/업로드로 클립 추가, 편집 타임라인의 자르기/삭제/
  // 순서변경)가 이 함수를 거치도록 해서, 바뀌기 직전 상태를 이력에 쌓아둡니다.
  function updateSegments(next) {
    historyRef.current.push(segments);
    setCanUndo(true);
    setSegments((prev) => (typeof next === "function" ? next(prev) : next));
  }

  function undo() {
    if (historyRef.current.length === 0) return;
    const restored = historyRef.current.pop();
    setCanUndo(historyRef.current.length > 0);
    setSegments(restored);
  }

  // Ctrl+Z / Cmd+Z — 입력창(제목 등)에 포커스가 있을 때는 브라우저 기본 텍스트
  // 되돌리기를 그대로 두고, 그 외에는 방금 편집한 클립 상태를 되돌립니다.
  useEffect(() => {
    function handleKeyDown(e) {
      const isUndoCombo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      if (!isUndoCombo) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      undo();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      if (micPrepTimeoutRef.current) clearTimeout(micPrepTimeoutRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function addClipFromBlob(blob, source, name) {
    try {
      const buffer = await decodeBlobToBuffer(blob);
      const id = nextClipId();
      // 녹음/업로드 직후 클립의 기본 볼륨은 항상 중앙(1 = 원본 그대로, 조정 없음)에서
      // 시작합니다. 예전엔 피크를 기준으로 자동 정규화 값을 계산해서 기본값으로 썼는데,
      // 녹음 직후 오디오는 피크가 작을 때가 많아서 계산된 값이 최대치(200%)로 튀는
      // 경우가 있었고, 그러면 업로드된 파일(보통 중앙 근처로 계산됨)과 시작 위치가
      // 달라 보였습니다. 이제는 소스와 상관없이 항상 중앙에서 시작하고, 필요하면
      // 클립 중앙의 볼륨 슬라이더로 직접 조정하면 됩니다.
      const gain = 1;
      updateSegments((prev) => [
        ...prev,
        {
          id,
          type: "clip",
          source,
          name,
          buffer,
          duration: buffer.duration,
          waveform: computeWaveformPeaks(buffer, barsForDuration(buffer.duration)),
          gain,
        },
      ]);
      setMicError("");
    } catch (e) {
      setMicError("오디오를 처리하는 중 문제가 발생했습니다. 다른 파일이나 기기로 다시 시도해주세요.");
    }
  }

  // 마이크를 새로 열 때 브라우저/운영체제가 입력 레벨을 스스로 다시 맞추는
  // 짧은 "적응 시간"이 있어서, autoGainControl을 꺼도 초반 1초 남짓은 소리가
  // 커졌다 작아지는 현상이 완전히 사라지지 않는 경우가 있습니다. 그래서
  // 스트림을 연 뒤 이 시간만큼 조용히 기다렸다가(화면엔 "마이크 준비 중"으로
  // 표시) 그 적응이 끝난 다음에야 실제 녹음을 시작합니다 — 이 대기 구간은
  // 녹음되지 않으므로 사용자가 듣는 결과물에는 그 흔들림이 남지 않습니다.
  const MIC_WARMUP_MS = 900;

  async function startRecording() {
    setMicError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("이 브라우저에서는 마이크 녹음을 지원하지 않습니다.");
      return;
    }
    try {
      // autoGainControl을 켜둔 채로 두면 브라우저가 녹음 시작 후 처음 몇 초 동안
      // 입력 레벨을 계속 다시 맞추면서 "커졌다가 작아지는" 것처럼 들리는 현상이
      // 생겨서, 여기서는 꺼둡니다(에코 제거·노이즈 억제는 음성 녹음에 도움이 되니
      // 그대로 켜둡니다).
      const constraints = {
        audio: {
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
          autoGainControl: false,
          echoCancellation: true,
          noiseSuppression: true,
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // 일부 브라우저는 getUserMedia에 넘긴 제약을 트랙에 완전히 반영하지
      // 않는 경우가 있어서, 스트림을 얻은 직후 트랙에도 한 번 더 명시적으로
      // 적용합니다(지원하지 않는 브라우저에서는 조용히 무시됩니다).
      const [audioTrack] = stream.getAudioTracks();
      try {
        await audioTrack?.applyConstraints({ autoGainControl: false });
      } catch (e) {
        // 일부 기기/브라우저는 이 재적용을 지원하지 않을 수 있어요 — 무시하고 진행합니다.
      }

      // Device labels are only visible after permission is granted —
      // refresh the list now that we have it.
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        setInputDevices(devices.filter((d) => d.kind === "audioinput"));
      });

      setIsPreparingMic(true);
      micPrepTimeoutRef.current = setTimeout(() => {
        micPrepTimeoutRef.current = null;
        // 대기하는 동안 사용자가 취소했다면(스트림이 이미 정리됐다면) 시작하지 않습니다.
        if (!streamRef.current) return;
        setIsPreparingMic(false);

        const mimeType = pickMimeType();
        const mr = mimeType
          ? new MediaRecorder(streamRef.current, { mimeType })
          : new MediaRecorder(streamRef.current);
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
      }, MIC_WARMUP_MS);
    } catch (err) {
      setMicError("마이크에 접근할 수 없습니다. 브라우저의 마이크 권한을 확인해주세요.");
    }
  }

  function stopRecording() {
    // 아직 "마이크 준비 중" 단계라면(적응 대기 중 취소) 녹음을 시작하지도 않고
    // 조용히 정리합니다.
    if (micPrepTimeoutRef.current) {
      clearTimeout(micPrepTimeoutRef.current);
      micPrepTimeoutRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsPreparingMic(false);
      return;
    }
    clearInterval(recordTimerRef.current);
    setIsRecording(false);
    mediaRecorderRef.current?.stop();
  }

  function toggleRecording() {
    if (isRecording || isPreparingMic) {
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

  // 공식 라이브러리는 아직 실제 음원 파일이 없는 샘플 목록이라 믹싱에 반영할 수 없고,
  // 내 라이브러리에서 실제로 업로드된(audioUrl이 있는) 트랙만 실제로 믹싱됩니다.
  const selectedBackgroundTrack = personalTracks.find(
    (t) => t.id === selectedTrack && t.audioUrl
  );


  // 선택된 배경음악을 한 번만 디코딩해서 캐시해둡니다 — 타임라인 두 번째 트랙 표시와
  // 미리듣기/저장 믹싱이 전부 이 캐시를 같이 씁니다(트랙을 바꿀 때만 다시 불러옴).
  const [bgTrackBuffer, setBgTrackBuffer] = useState(null);
  const [bgTrackUrl, setBgTrackUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadBackgroundTrack() {
      if (!selectedBackgroundTrack) {
        setBgTrackBuffer(null);
        setBgTrackUrl("");
        return;
      }
      if (selectedBackgroundTrack.audioUrl === bgTrackUrl) return;
      try {
        const buffer = await decodeUrlToBuffer(selectedBackgroundTrack.audioUrl);
        if (cancelled) return;
        setBgTrackBuffer(buffer);
        setBgTrackUrl(selectedBackgroundTrack.audioUrl);
        setBgMixError("");
      } catch (e) {
        if (!cancelled) setBgMixError("배경음악을 불러오지 못했어요.");
      }
    }
    loadBackgroundTrack();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBackgroundTrack?.audioUrl]);

  // 목소리 편집 결과 + (있다면) 실제 배경음악을 선택한 볼륨/인트로 길이로 합친 최종 버퍼.
  // 미리듣기와 저장이 항상 같은 결과를 내도록 이 함수 하나를 공유해서 씁니다.
  async function buildFinalMixedBuffer() {
    const voiceBuffer = buildContinuousBuffer(segments, { skipGaps: true });
    if (!voiceBuffer) return null;
    if (!selectedBackgroundTrack) return voiceBuffer;
    try {
      const bgBuffer =
        bgTrackBuffer && bgTrackUrl === selectedBackgroundTrack.audioUrl
          ? bgTrackBuffer
          : await decodeUrlToBuffer(selectedBackgroundTrack.audioUrl);
      setBgMixError("");
      return mixVoiceWithBackground(voiceBuffer, bgBuffer, musicVolume, voiceOffsetSeconds);
    } catch (e) {
      setBgMixError("배경음악을 불러오지 못해 이번엔 목소리만 재생/저장했어요.");
      return voiceBuffer;
    }
  }

  function resetForm() {
    setSegments([]);
    historyRef.current = [];
    setCanUndo(false);
    setVoiceOffsetSeconds(DEFAULT_VOICE_OFFSET_SECONDS);
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
      // the same effect as pressing "자동으로 붙이기" before saving. Uses the
      // same mixer as the preview button, so what you hear is what gets saved.
      const finalBuffer = await buildFinalMixedBuffer();
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
      <div>
        <h1 className="text-lg font-semibold text-stone-900">제작/관리</h1>
        <p className="mt-1 text-sm text-stone-500">
          나눔을 녹음·편집·저장하거나, 사이트 전체 디자인(배경 스킨)을 관리하세요.
        </p>
      </div>

      <div className="flex gap-1 rounded-full bg-stone-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMainTab("content")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition ${
            mainTab === "content" ? "bg-white shadow-sm text-stone-900" : "text-stone-500"
          }`}
        >
          <Mic size={14} /> 제작
        </button>
        <button
          type="button"
          onClick={() => setMainTab("manage")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition ${
            mainTab === "manage" ? "bg-white shadow-sm text-stone-900" : "text-stone-500"
          }`}
        >
          <ListChecks size={14} /> 콘텐츠 관리
        </button>
        <button
          type="button"
          onClick={() => setMainTab("design")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition ${
            mainTab === "design" ? "bg-white shadow-sm text-stone-900" : "text-stone-500"
          }`}
        >
          <ImageIcon size={14} /> 디자인
        </button>
      </div>

      {mainTab === "design" ? (
        <DesignSkinPanel />
      ) : mainTab === "manage" ? (
        <ManageContentPanel />
      ) : (
      <>
      <section>
        <h2 className="text-base font-semibold text-stone-900">녹음 / 믹싱</h2>
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
                disabled={isRecording || isPreparingMic}
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
                    isRecording
                      ? "bg-red-600 animate-pulse"
                      : isPreparingMic
                      ? "bg-stone-400"
                      : "bg-amber-700 hover:bg-amber-800"
                  }`}
                  aria-label={isRecording ? "녹음 중지" : isPreparingMic ? "마이크 준비 취소" : "녹음 시작"}
                >
                  {isRecording ? "■" : isPreparingMic ? "…" : "●"}
                </button>
                <p className="text-sm text-stone-600">
                  {isRecording
                    ? `녹음 중… (${formatDuration(recordSeconds)})`
                    : isPreparingMic
                    ? "마이크 준비 중… (입력 레벨이 안정되는 중이에요)"
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

        {/* 녹음/업로드 바로 아래에 파형 편집 영역을 이어 붙여서, 별도 섹션으로
            떨어져 있던 예전 레이아웃보다 공간을 덜 차지하도록 했습니다. */}
        <div className="mt-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-900">
            오디오 편집 <span className="text-xs font-normal text-stone-400">(마그네틱 타임라인)</span>
          </h2>
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="이전 상태로 계속 되돌리기 (Ctrl+Z / Cmd+Z)"
          >
            <Undo2 size={13} /> 실행 취소
          </button>
        </div>
        <div className="mt-3">
          <ClipTimeline
            segments={segments}
            onChange={updateSegments}
            backgroundBuffer={bgTrackBuffer}
            backgroundName={selectedBackgroundTrack?.name}
            backgroundVolume={musicVolume}
            onBackgroundVolumeChange={setMusicVolume}
            voiceOffsetSeconds={voiceOffsetSeconds}
            onVoiceOffsetChange={setVoiceOffsetSeconds}
          />
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
          <BackgroundMusicPicker
            selectedTrackId={selectedTrack}
            onSelect={setSelectedTrack}
            volume={Math.min(1, musicVolume)}
          />
        </div>

        <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">
            배경음악 볼륨은 위 편집 타임라인의 배경음악 트랙 안에 있는 세로선을 드래그해서
            조절해요(위로 올리면 커지고, 아래로 내리면 작아져요).
          </p>
          {selectedBackgroundTrack ? (
            <p className="mt-2 text-xs text-emerald-600">
              &quot;{selectedBackgroundTrack.name}&quot;이(가) 먼저 나오고, {voiceOffsetSeconds.toFixed(1)}초 후
              목소리가 이어서 시작돼요. 목소리가 나오기 {BG_DUCK_LEAD_SECONDS}초 전부터 배경음악이
              자동으로 작아지고(더킹, 설정 볼륨의 35% 수준), 목소리가 나오는 동안 계속 낮게 유지돼요.
              메시지가 끝나면 배경음악만 약 {BG_FADE_OUT_SECONDS}초 더 이어지며 서서히 페이드아웃돼요.
              (편집 타임라인의 하늘색 인트로 구간을 드래그하면 길이를 바꿀 수 있어요.)
            </p>
          ) : (
            <p className="mt-2 text-xs text-stone-400">
              공식 라이브러리는 아직 실제 음원 파일이 없는 샘플이라 믹싱에 반영되지 않아요. 실제로 믹싱하려면
              &quot;내 라이브러리&quot;에 배경음악을 업로드한 뒤 선택해주세요.
            </p>
          )}
          {bgMixError && <p className="mt-1 text-xs text-red-600">{bgMixError}</p>}
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
          onClick={handleSave}
          disabled={clipCount === 0 || isSaving}
          className="rounded-full bg-amber-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isSaving ? "믹싱 중…" : "업로드"}
        </button>
      </div>
      </>
      )}
    </div>
  );
}
