"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ImageIcon, RotateCcw, UploadCloud } from "lucide-react";
import { uploadSkinImage } from "@/lib/siteSettings";
import { useAppStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export default function DesignSkinPanel() {
  const { skinImageUrl, setSkinImage, resetSkinImage, textColor, setTextColor } = useAppStore();
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState("");
  const [appliedMessage, setAppliedMessage] = useState(false);
  const fileInputRef = useRef(null);

  function handlePickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setAppliedMessage(false);
    setPreviewFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function clearPending() {
    setPreviewFile(null);
    setPreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleApply() {
    if (!previewFile) return;
    setError("");
    setIsApplying(true);
    try {
      if (!isSupabaseConfigured) {
        // 서버 미연결 상태에서는 이 브라우저 탭에서만 보이는 임시 적용입니다.
        setSkinImage(previewUrl);
        setAppliedMessage(true);
        setPreviewFile(null);
        return;
      }
      const result = await uploadSkinImage(previewFile);
      if (result.ok) {
        setSkinImage(result.url);
        setAppliedMessage(true);
        clearPending();
      } else {
        setError(`적용에 실패했어요: ${result.reason}`);
      }
    } finally {
      setIsApplying(false);
    }
  }

  function handleReset() {
    resetSkinImage();
    clearPending();
    setAppliedMessage(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
          <ImageIcon size={15} /> 배경 이미지 하나로 홈 화면 디자인을 입힙니다
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-500">
          업로드한 이미지 한 장이 홈 화면 전체(맨 위 로고·메뉴 영역까지)의 배경으로
          깔려서 하나의 그림 같은 느낌을 줘요. &ldquo;제작/관리&rdquo; 페이지 등 다른 화면은
          작업에 방해되지 않도록 원래의 흰 배경을 그대로 유지합니다. 지금은 모바일
          화면 기준으로 맞춰뒀습니다.
        </p>
        <div className="mt-3 rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
          <p className="font-medium text-stone-600">권장 이미지 사양</p>
          <ul className="mt-1 space-y-0.5">
            <li>· 해상도: 1080 × 2340px (세로형, 요즘 스마트폰 화면 비율에 맞춘 크기)</li>
            <li>· 형식: JPG 또는 WebP</li>
            <li>· 용량: 500KB 이하 권장 (모바일 로딩 속도)</li>
          </ul>
          <p className="mt-1.5 text-stone-400">
            비율이 다른 이미지를 올려도 화면을 가득 채우도록 자동으로 잘려서 표시돼요.
          </p>
        </div>
        {!isSupabaseConfigured && (
          <p className="mt-3 text-xs text-amber-600">
            서버(Supabase)가 아직 연결되지 않아, 지금 적용하면 이 브라우저 탭에서만
            보이고 새로고침하면 사라져요.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-xs font-medium text-stone-500">현재 적용된 배경</p>
        <div className="mt-2 flex h-40 items-center justify-center overflow-hidden rounded-lg bg-stone-100">
          {skinImageUrl ? (
            <img src={skinImageUrl} alt="현재 배경 스킨" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-stone-400">적용된 배경 이미지가 없습니다 (기본 화면)</span>
          )}
        </div>
        {skinImageUrl && (
          <button
            type="button"
            onClick={handleReset}
            className="mt-3 flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
          >
            <RotateCcw size={13} /> 기본 화면으로 되돌리기
          </button>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
          <div>
            <p className="text-xs font-medium text-stone-600">홈 화면 글자색</p>
            <p className="mt-0.5 text-[11px] text-stone-400">
              배경 이미지 위에 올라가는 제목·목록 글자 색이에요.
            </p>
          </div>
          <input
            type="color"
            value={textColor || "#ffffff"}
            onChange={(e) => setTextColor(e.target.value)}
            className="h-9 w-9 cursor-pointer rounded-lg border border-stone-300 bg-white p-0.5"
            aria-label="홈 화면 글자색 선택"
          />
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg py-8 text-sm text-stone-500 hover:bg-stone-50">
          <UploadCloud size={22} />
          새 배경 이미지 선택하기
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePickFile}
          />
        </label>

        {previewUrl && (
          <div className="mt-3 space-y-3">
            <p className="text-xs font-medium text-stone-500">미리보기</p>
            <div className="h-40 overflow-hidden rounded-lg bg-stone-100">
              <img src={previewUrl} alt="선택한 이미지 미리보기" className="h-full w-full object-cover" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={isApplying}
                className="flex-1 rounded-full bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {isApplying ? "적용 중…" : "이 이미지로 적용하기"}
              </button>
              <button
                type="button"
                onClick={clearPending}
                disabled={isApplying}
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        {appliedMessage && !error && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 size={13} /> 배경 이미지가 적용됐어요.
          </p>
        )}
      </div>
    </div>
  );
}
