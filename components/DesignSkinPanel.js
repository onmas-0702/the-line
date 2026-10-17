"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ImageIcon, RotateCcw, UploadCloud } from "lucide-react";
import { ChannelImagePanel } from "@/components/channel/ChannelImageEditor";
import { useChannel } from "@/components/ChannelProvider";
import { useAppStore } from "@/lib/store";
import { ChannelImageSlot } from "@/lib/channelProfile";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export default function DesignSkinPanel() {
  const { skinImageUrl, setSkinImage, resetSkinImage } = useAppStore();
  const { repos } = useChannel();
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
      const result = await repos.siteSettings.uploadSkinImage(previewFile);
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
      <p className="text-xs text-stone-500">
        채널 페이지 상단을 꾸밉니다. 채널 페이지에서 관리자로 볼 때 이미지 위의 &ldquo;변경&rdquo; 버튼으로도
        바로 바꿀 수 있어요.
      </p>
      <ChannelImagePanel slot={ChannelImageSlot.BANNER} />
      <ChannelImagePanel slot={ChannelImageSlot.COVER} />

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
          <ImageIcon size={15} /> 기본 배경 이미지
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-500">
          대표이미지나 로고를 아직 등록하지 않았을 때 그 자리를 대신 채우는 이미지예요.
          (예전 &ldquo;홈 화면 배경 스킨&rdquo;이 이 역할로 바뀌었어요.)
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
        <p className="text-xs font-medium text-stone-500">현재 기본 배경 이미지</p>
        <div className="mt-2 flex h-40 items-center justify-center overflow-hidden rounded-lg bg-stone-100">
          {skinImageUrl ? (
            <img src={skinImageUrl} alt="현재 배경 스킨" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-stone-400">등록된 기본 배경 이미지가 없습니다</span>
          )}
        </div>
        {skinImageUrl && (
          <button
            type="button"
            onClick={handleReset}
            className="mt-3 flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
          >
            <RotateCcw size={13} /> 기본 배경 이미지 지우기
          </button>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg py-8 text-sm text-stone-500 hover:bg-stone-50">
          <UploadCloud size={22} />
          새 기본 배경 이미지 선택하기
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
            <CheckCircle2 size={13} /> 기본 배경 이미지가 적용됐어요.
          </p>
        )}
      </div>
    </div>
  );
}
