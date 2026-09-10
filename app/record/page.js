"use client";

import { useState } from "react";
import { Mic, Upload, CheckCircle2 } from "lucide-react";
import ClipTimeline from "@/components/ClipTimeline";
import BackgroundMusicPicker from "@/components/BackgroundMusicPicker";
import { generateWaveform } from "@/lib/waveform";
import { useAppStore } from "@/lib/store";

const inputDevices = [
  "기본 마이크 (내장)",
  "USB 마이크 — Blue Yeti",
  "USB 마이크 — Rode NT-USB",
  "블루투스 헤드셋 마이크",
];

let clipCounter = 0;
function nextClipId() {
  clipCounter += 1;
  return `clip-${Date.now()}-${clipCounter}`;
}

export default function RecordPage() {
  const { addAudio } = useAppStore();

  const [activeTab, setActiveTab] = useState("record");
  const [isRecording, setIsRecording] = useState(false);
  const [inputDevice, setInputDevice] = useState(inputDevices[0]);
  const [segments, setSegments] = useState([]);

  const [selectedTrack, setSelectedTrack] = useState("bg1");
  const [musicVolume, setMusicVolume] = useState(35);
  const [scriptFileName, setScriptFileName] = useState("");

  const [title, setTitle] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);

  function addSegment(source, name) {
    const id = nextClipId();
    setSegments((prev) => [
      ...prev,
      {
        id,
        type: "clip",
        source,
        name,
        units: 30,
        waveform: generateWaveform(id),
      },
    ]);
  }

  function toggleRecording() {
    if (isRecording) {
      setIsRecording(false);
      addSegment("recorded", `녹음 클립 ${segments.filter((s) => s.type === "clip").length + 1}`);
    } else {
      setIsRecording(true);
    }
  }

  function handleUploadClip(e) {
    const file = e.target.files?.[0];
    if (file) addSegment("uploaded", file.name);
    e.target.value = "";
  }

  const clipCount = segments.filter((s) => s.type === "clip").length;

  function handleSave() {
    if (clipCount === 0) return;
    addAudio({
      title: title.trim() || "제목 없는 나눔",
      hasScript: Boolean(scriptFileName),
      scriptFileName,
      duration: `0${Math.max(1, clipCount)}:${clipCount > 9 ? "" : "3" + clipCount}`,
    });
    setSavedMessage(true);
    setSegments([]);
    setTitle("");
    setScriptFileName("");
    setTimeout(() => setSavedMessage(false), 4000);
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-lg font-semibold text-stone-900">녹음 / 믹싱</h1>
        <p className="mt-1 text-sm text-stone-500">
          직접 녹음하거나 파일을 업로드해서 짧은 나눔을 만들어보세요.
        </p>

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
                value={inputDevice}
                onChange={(e) => setInputDevice(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
              >
                {inputDevices.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-stone-400">
                USB 마이크가 목록에 없다면 컴퓨터에 먼저 연결해주세요.
              </p>

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
                  {isRecording ? "녹음 중… (00:07)" : "버튼을 눌러 녹음을 시작하세요"}
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
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">
          오디오 편집 <span className="text-xs font-normal text-stone-400">(마그네틱 타임라인)</span>
        </h2>
        <div className="mt-3">
          <ClipTimeline segments={segments} onChange={setSegments} />
        </div>
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
            음성이 시작되면 배경음악 볼륨이 자동으로 낮아집니다 (더킹 효과).
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">제목</h2>
        <div className="mt-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="나눔 제목을 입력하세요"
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
          />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">대본 첨부</h2>
        <div className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white p-4 text-center">
          <label className="block cursor-pointer text-sm text-stone-500">
            {scriptFileName ? (
              <span className="text-amber-700">{scriptFileName}</span>
            ) : (
              <>녹음에 사용한 대본 파일을 선택하세요 (.txt, .docx, .pdf)</>
            )}
            <input
              type="file"
              className="hidden"
              onChange={(e) => setScriptFileName(e.target.files?.[0]?.name ?? "")}
            />
          </label>
        </div>
      </section>

      {savedMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> 저장되었습니다. 홈 화면과 마이페이지에서 확인할 수 있어요.
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
          disabled={clipCount === 0}
          className="rounded-full bg-amber-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          믹싱하고 공유하기
        </button>
      </div>
    </div>
  );
}
