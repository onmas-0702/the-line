"use client";

// 오디오 작업대 화면 — 녹음/파일 업로드(끌어다 놓기) → 오디오 편집(마그네틱 타임라인) → 배경음악.
// 콘텐츠 제작과 콘텐츠 관리(다시 편집)가 같은 화면을 씁니다. 상태는 useAudioWorkbench().

import { useRef, useState } from "react";
import { AlertCircle, Mic, Undo2, Upload } from "lucide-react";
import BackgroundMusicPicker from "@/components/BackgroundMusicPicker";
import ClipTimeline from "@/components/ClipTimeline";
import FileDropZone from "@/components/common/FileDropZone";
import { BackgroundMixer, TimeFormat } from "@/lib/audio";
import { FileKind } from "@/lib/fileDrop";

function RecordPane({ workbench }) {
  const { isRecording, isPreparingMic, recordSeconds, inputDevices, selectedDeviceId } = workbench;
  return (
    <>
      <label className="block text-xs font-medium text-stone-500">입력 장치</label>
      <select
        value={selectedDeviceId}
        onChange={(e) => workbench.setSelectedDeviceId(e.target.value)}
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

      <div className="mt-5 flex flex-col items-center gap-3 rounded-xl bg-stone-50 py-8">
        <button
          type="button"
          onClick={workbench.toggleRecording}
          className={`rec-red flex h-16 w-16 items-center justify-center rounded-full text-white shadow-sm transition ${
            isRecording ? "animate-pulse bg-red-700" : isPreparingMic ? "bg-red-300" : "bg-red-600"
          }`}
          aria-label={isRecording ? "녹음 중지" : isPreparingMic ? "마이크 준비 취소" : "녹음 시작"}
        >
          {isRecording ? "■" : isPreparingMic ? "…" : "●"}
        </button>
        <p className="text-sm text-stone-600">
          {isRecording
            ? `녹음 중… (${TimeFormat.duration(recordSeconds)})`
            : isPreparingMic
            ? "마이크 준비 중… (입력 레벨이 안정되는 중이에요)"
            : "버튼을 눌러 녹음을 시작하세요"}
        </p>
      </div>
    </>
  );
}

/** afterTimeline: 오디오·배경음악 트랙 바로 아래에 둘 것(예: 콘텐츠 제작의 [작업 저장하기]). */
export default function AudioWorkbench({ workbench, intro = null, defaultInputTab = "record", afterTimeline = null }) {
  const [inputTab, setInputTab] = useState(defaultInputTab);
  const pickerRef = useRef(null);
  const { selectedBackgroundTrack, voiceOffsetSeconds } = workbench;

  return (
    <>
      <section>
        <h2 className="text-base font-semibold text-stone-900">녹음 / 믹싱</h2>
        <p className="mt-1 text-sm text-stone-500">직접 녹음하거나 파일을 올려(끌어다 놓아도 돼요) 나눔을 만들어보세요.</p>
        {intro}

        <div className="mt-4 flex gap-1 rounded-full bg-stone-100 p-1 text-sm">
          {[
            { key: "record", label: "녹음하기", icon: Mic },
            { key: "upload", label: "파일 업로드", icon: Upload },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setInputTab(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition ${
                inputTab === key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
          {inputTab === "record" ? (
            <RecordPane workbench={workbench} />
          ) : (
            <FileDropZone
              kind={FileKind.AUDIO}
              multiple
              onFiles={(files) => workbench.addFiles(files)}
              onReject={(files) => workbench.addFiles([], files)}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 py-10 text-center text-sm text-stone-500 transition hover:bg-stone-50"
            >
              <Upload size={22} />
              <span>
                오디오 파일을 <b className="font-semibold text-stone-700">여기로 끌어다 놓거나</b> 눌러서 고르세요
              </span>
              <span className="text-xs text-stone-400">.mp3 · .wav · .m4a · 여러 개를 한 번에 놓으면 순서대로 이어 붙여요</span>
            </FileDropZone>
          )}
          {workbench.micError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              <AlertCircle size={14} /> {workbench.micError}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-900">
            오디오 편집 <span className="text-xs font-normal text-stone-400">(마그네틱 타임라인)</span>
          </h2>
          <button
            type="button"
            onClick={workbench.undo}
            disabled={!workbench.canUndo}
            className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="이전 상태로 계속 되돌리기 (Ctrl+Z / Cmd+Z)"
          >
            <Undo2 size={13} /> 실행 취소
          </button>
        </div>
        <div className="mt-3">
          <ClipTimeline
            segments={workbench.segments}
            onChange={workbench.updateSegments}
            backgroundBuffer={workbench.bgTrackBuffer}
            backgroundName={selectedBackgroundTrack?.name}
            backgroundVolume={workbench.musicVolume}
            onBackgroundVolumeChange={workbench.setMusicVolume}
            voiceOffsetSeconds={voiceOffsetSeconds}
            onVoiceOffsetChange={workbench.setVoiceOffsetSeconds}
            musicClip={workbench.musicClip}
            onMusicClipChange={workbench.setMusicClip}
            onDropFiles={(files, rejected) => workbench.addFiles(files, rejected)}
            backgroundPending={Boolean(selectedBackgroundTrack) && !workbench.bgTrackBuffer}
            onRequestBackground={() => pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        </div>
        {workbench.clips.length > 0 && (
          <p className="mt-2 text-xs text-stone-400">
            클립 {workbench.clips.length}개 · 총 {TimeFormat.duration(workbench.totalClipSeconds)}
          </p>
        )}
        {afterTimeline}
      </section>

      <section ref={pickerRef} className="scroll-mt-4">
        <h2 className="text-base font-semibold text-stone-900">배경음악 선택 &amp; 믹싱</h2>
        <p className="mt-1 text-xs text-stone-400">
          곡의 <b className="font-medium text-night-700">[트랙에 올리기]</b>를 누르면 위 편집 타임라인의 배경음악 트랙에 올라가요.
          다시 누르면 내려요.
        </p>
        <div className="mt-3">
          <BackgroundMusicPicker
            selectedTrackId={workbench.selectedTrack}
            onSelect={workbench.setSelectedTrack}
            volume={Math.min(1, workbench.musicVolume)}
          />
        </div>

        <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">
            배경음악 볼륨은 위 편집 타임라인의 배경음악 트랙 안에 있는 세로선을 드래그해서 조절해요(위로 올리면 커지고,
            아래로 내리면 작아져요).
          </p>
          {selectedBackgroundTrack ? (
            <p className="mt-2 text-xs text-emerald-600">
              &quot;{selectedBackgroundTrack.name}&quot;이(가) 먼저 나오고, {voiceOffsetSeconds.toFixed(1)}초 후 목소리가 이어서
              시작돼요. 배경음악은 처음 {BackgroundMixer.DUCK_AFTER_SECONDS}초 동안 원래 볼륨으로 나오다가
              {BackgroundMixer.DUCK_RAMP_SECONDS}초에 걸쳐 설정 볼륨의 {Math.round(BackgroundMixer.DUCK_LEVEL * 100)}% 수준으로
              낮아지고(더킹), 목소리가 나오는 동안 계속 낮게 유지돼요. 마지막 오디오가 끝나면 배경음악만{" "}
              {BackgroundMixer.FADE_OUT_SECONDS}초 더 이어지며 서서히 페이드아웃돼요. 이 볼륨 변화는 편집 타임라인의 배경음악
              트랙 파형에도 그대로 보여요. (하늘색 인트로 구간을 드래그하면 목소리 시작 시점을 바꿀 수 있어요.)
            </p>
          ) : (
            <p className="mt-2 text-xs text-stone-400">
              배경음악을 고르지 않았어요. 위 라이브러리에서 곡을 선택하면 목소리와 함께 믹싱돼요.
            </p>
          )}
          {workbench.bgMixError && <p className="mt-1 text-xs text-red-600">{workbench.bgMixError}</p>}
        </div>
      </section>
    </>
  );
}
