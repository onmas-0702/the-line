"use client";

// 오디오 작업대 상태 — 콘텐츠 제작(새로 만들기)과 콘텐츠 관리(다시 편집)가 똑같이 씁니다.
// 녹음·파일 추가(끌어다 놓기 포함), 클립 편집(자르기·트리밍·볼륨·순서)과 실행 취소, 배경음악
// 고르기·볼륨·인트로 길이, 그리고 저장할 결과(AudioRender)를 만듭니다. 화면은 AudioWorkbench.js.

import { useEffect, useRef, useState } from "react";
import { AudioEngine, BackgroundMixer, ClipGain } from "@/lib/audio";
import { AudioEditSettings, AudioProjectLoader, AudioRender, MusicClip } from "@/lib/audioProject";
import { MicrophoneDevices, MicrophoneRecorder, RecorderError } from "@/lib/recorder";
import { useAppStore } from "@/lib/store";
import { FocusGuard, Segment, Timeline, UndoHistory } from "@/lib/timeline";

export function useAudioWorkbench() {
  const { personalTracks } = useAppStore();

  const [segments, setSegments] = useState([]);
  const [canUndo, setCanUndo] = useState(false);
  const [isDirty, setIsDirty] = useState(false); // 불러온 뒤(또는 처음부터) 무엇이든 바꿨는지
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparingMic, setIsPreparingMic] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [inputDevices, setInputDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [micError, setMicError] = useState("");

  const [selectedTrack, setSelectedTrackState] = useState(null);
  // 배경음악 볼륨 — 나레이션 클립 볼륨과 같은 척도(0~2, 1 = 원본 그대로).
  const [musicVolume, setMusicVolumeState] = useState(ClipGain.DEFAULT);
  // 배경음악만 먼저 나오는 인트로 길이(초).
  const [voiceOffsetSeconds, setVoiceOffsetState] = useState(BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS);
  // 배경음악 클립(타임라인 시작·곡 안 시작·끝) — 배경음악 트랙에서 가장자리를 끌어 바꿉니다.
  const [musicClip, setMusicClipState] = useState(() => new MusicClip());
  const [bgTrackBuffer, setBgTrackBuffer] = useState(null);
  const [bgTrackUrl, setBgTrackUrl] = useState("");
  const [bgMixError, setBgMixError] = useState("");

  const historyRef = useRef(null);
  const recorderRef = useRef(null);
  const recordTimerRef = useRef(null);

  function history() {
    if (!historyRef.current) historyRef.current = new UndoHistory();
    return historyRef.current;
  }

  function recorder() {
    if (!recorderRef.current) {
      recorderRef.current = new MicrophoneRecorder({
        onPreparingChange: setIsPreparingMic,
        onDevicesRefreshed: setInputDevices,
        onStart: () => {
          setIsRecording(true);
          setRecordSeconds(0);
          recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
        },
      });
    }
    return recorderRef.current;
  }

  // segments를 바꾸는 모든 경로가 이 함수를 거치게 해서, 바뀌기 직전 상태를 이력에 쌓아둡니다.
  function updateSegments(next) {
    history().push(segments);
    setCanUndo(true);
    setIsDirty(true);
    setSegments((prev) => (typeof next === "function" ? next(prev) : next));
  }

  function undo() {
    if (!history().canUndo) return;
    const restored = history().pop();
    setCanUndo(history().canUndo);
    setSegments(restored);
  }

  // Ctrl+Z / Cmd+Z — 입력창에 포커스가 있으면 브라우저 기본 되돌리기를 그대로 둡니다.
  const undoRef = useRef(undo);
  useEffect(() => {
    undoRef.current = undo;
  });
  useEffect(() => {
    function handleKeyDown(e) {
      const isUndoCombo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      if (!isUndoCombo || FocusGuard.isTyping()) return;
      e.preventDefault();
      undoRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 실제 마이크 목록(권한을 한 번 허용해야 이름이 보입니다).
  useEffect(() => {
    let cancelled = false;
    async function loadDevices() {
      try {
        const mics = await MicrophoneDevices.list();
        if (cancelled) return;
        setInputDevices(mics);
        setSelectedDeviceId((prev) => (prev && mics.some((m) => m.deviceId === prev) ? prev : mics[0]?.deviceId || ""));
      } catch {
        // 목록이 비어 있으면 기본 마이크를 씁니다.
      }
    }
    loadDevices();
    const unsubscribe = MicrophoneDevices.onChange(loadDevices);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      clearInterval(recordTimerRef.current);
      recorderRef.current?.dispose();
    };
  }, []);

  async function addClipFromBlob(blob, source, name) {
    try {
      const buffer = await AudioEngine.decodeBlob(blob);
      updateSegments((prev) => [...prev, Segment.clip({ buffer, source, name, originSource: { blob } })]);
      setMicError("");
      return true;
    } catch {
      setMicError(`"${name}"을(를) 열지 못했어요. 다른 파일이나 기기로 다시 시도해주세요.`);
      return false;
    }
  }

  /** 고르거나 끌어다 놓은 오디오 파일들을 순서대로 클립으로 추가합니다. */
  async function addFiles(files, rejected = []) {
    if (rejected.length > 0) {
      setMicError(`오디오 파일이 아니라서 건너뛰었어요: ${rejected.map((f) => f.name).join(", ")}`);
    }
    for (const file of files) await addClipFromBlob(file, "uploaded", file.name);
  }

  async function startRecording() {
    setMicError("");
    const clipNumber = new Timeline(segments).clips.length + 1;
    try {
      await recorder().start({
        deviceId: selectedDeviceId,
        onRecorded: (blob) => addClipFromBlob(blob, "recorded", `녹음 클립 ${clipNumber}`),
      });
    } catch (err) {
      setMicError(err instanceof RecorderError ? err.message : "마이크에 접근할 수 없습니다. 브라우저의 마이크 권한을 확인해주세요.");
    }
  }

  function stopRecording() {
    // 아직 "마이크 준비 중"이면 녹음을 시작하지도 않고 조용히 정리됩니다.
    if (recorder().stop() === "cancelled") return;
    clearInterval(recordTimerRef.current);
    setIsRecording(false);
  }

  function toggleRecording() {
    if (isRecording || isPreparingMic) stopRecording();
    else startRecording();
  }

  function setSelectedTrack(id) {
    setSelectedTrackState(id);
    if (id !== selectedTrack) setMusicClipState(new MusicClip()); // 곡을 바꾸면 클립 위치는 처음부터
    setIsDirty(true);
  }

  function setMusicVolume(volume) {
    setMusicVolumeState(volume);
    setIsDirty(true);
  }

  function setMusicClip(next) {
    setMusicClipState(next);
    setIsDirty(true);
  }

  function setVoiceOffsetSeconds(seconds) {
    setVoiceOffsetState(seconds);
    setIsDirty(true);
  }

  // 실제로 업로드된(audioUrl이 있는) 트랙만 믹싱됩니다.
  const selectedBackgroundTrack = personalTracks.find((t) => t.id === selectedTrack && t.audioUrl) || null;

  // 고른 배경음악을 한 번만 디코딩해서, 타임라인 표시·미리듣기·저장이 함께 씁니다.
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
        const buffer = await AudioEngine.decodeUrl(selectedBackgroundTrack.audioUrl);
        if (cancelled) return;
        setBgTrackBuffer(buffer);
        setBgTrackUrl(selectedBackgroundTrack.audioUrl);
        setBgMixError("");
      } catch {
        if (!cancelled) setBgMixError("배경음악을 불러오지 못했어요.");
      }
    }
    loadBackgroundTrack();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBackgroundTrack?.audioUrl]);

  const settings = new AudioEditSettings({ backgroundTrackId: selectedTrack, musicVolume, voiceOffsetSeconds, musicClip });
  const clips = new Timeline(segments).clips;

  /** 지금 편집 상태로 저장할 결과. 배경음악을 못 불러오면 목소리만 저장합니다. 클립이 없으면 null. */
  async function render() {
    let backgroundBuffer = null;
    if (selectedBackgroundTrack) {
      try {
        backgroundBuffer =
          bgTrackBuffer && bgTrackUrl === selectedBackgroundTrack.audioUrl
            ? bgTrackBuffer
            : await AudioEngine.decodeUrl(selectedBackgroundTrack.audioUrl);
        setBgMixError("");
      } catch {
        setBgMixError("배경음악을 불러오지 못해 이번엔 목소리만 저장했어요.");
      }
    }
    return AudioRender.from({ segments, backgroundBuffer, settings });
  }

  /** 처음 상태로(새 콘텐츠 만들기를 마친 뒤). */
  function reset() {
    setSegments([]);
    history().clear();
    setCanUndo(false);
    setIsDirty(false);
    setVoiceOffsetState(BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS);
    setMusicClipState(new MusicClip());
  }

  /** 저장된 콘텐츠를 불러와 편집을 시작합니다(불러온 상태는 "바뀐 것"으로 치지 않음). */
  async function load(item) {
    const project = await AudioProjectLoader.load(item);
    setSegments(project.segments);
    history().clear();
    setCanUndo(false);
    setSelectedTrackState(project.settings.backgroundTrackId);
    setMusicVolumeState(project.settings.musicVolume);
    setVoiceOffsetState(project.settings.voiceOffsetSeconds);
    setMusicClipState(project.settings.musicClip);
    setIsDirty(false);
    return project;
  }

  /** 저장해 둔 작업을 되살립니다(되살린 상태는 "바뀐 것"으로 치지 않음). */
  function restore({ segments: restored, settings: saved }) {
    setSegments(restored);
    history().clear();
    setCanUndo(false);
    setSelectedTrackState(saved.backgroundTrackId);
    setMusicVolumeState(saved.musicVolume);
    setVoiceOffsetState(saved.voiceOffsetSeconds);
    setMusicClipState(saved.musicClip);
    setIsDirty(false);
  }

  /** 저장한 직후 — 지금 상태를 "저장됨"으로. */
  function markSaved() {
    setIsDirty(false);
  }

  return {
    segments,
    updateSegments,
    undo,
    canUndo,
    isDirty,
    clips,
    totalClipSeconds: clips.reduce((sum, s) => sum + (s.duration || 0), 0),
    hasRecordedClip: clips.some((s) => s.source === "recorded"),
    // 녹음
    isRecording,
    isPreparingMic,
    recordSeconds,
    inputDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    toggleRecording,
    micError,
    // 파일
    addFiles,
    // 배경음악
    selectedTrack,
    setSelectedTrack,
    selectedBackgroundTrack,
    bgTrackBuffer,
    musicVolume,
    setMusicVolume,
    voiceOffsetSeconds,
    setVoiceOffsetSeconds,
    musicClip,
    setMusicClip,
    bgMixError,
    // 결과
    settings,
    render,
    reset,
    load,
    restore,
    markSaved,
  };
}
