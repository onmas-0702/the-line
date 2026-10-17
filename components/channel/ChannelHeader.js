"use client";

// 채널 페이지 상단 — 유튜브 채널처럼 맨 위에 대표이미지(배너), 그 아래 네모 로고와
// 채널 이름·구독자 정보·소개글, 그리고 버튼 줄. 관리자에게만 이미지 교체 버튼과
// "콘텐츠 제작·관리" 버튼이 보입니다(판단은 AccessPolicy).

import Link from "next/link";
import { useState } from "react";
import { Check, Clapperboard, Palette, Pencil, X } from "lucide-react";
import { ImageEditOverlay } from "@/components/channel/ChannelImageEditor";
import { useChannel } from "@/components/ChannelProvider";
import { useViewer } from "@/components/ViewerProvider";
import { AccessPolicy } from "@/lib/access";
import { ChannelImageSlot } from "@/lib/channelProfile";
import { useAppStore } from "@/lib/store";

function DescriptionEditor({ initial, onSave, onCancel }) {
  const [text, setText] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setIsSaving(true);
    setError("");
    const result = await onSave(text.trim());
    setIsSaving(false);
    if (result?.ok === false) setError(`저장에 실패했어요: ${result.reason}`);
    else onCancel();
  }

  return (
    <div className="mt-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={300}
        placeholder="채널을 한두 문장으로 소개해주세요"
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-amber-500 focus:outline-none"
      />
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[11px] text-stone-400">{text.length}/300</span>
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="ml-auto flex items-center gap-1 rounded-full bg-amber-700 px-3 py-1 text-xs font-medium text-white disabled:bg-stone-300"
        >
          <Check size={12} /> {isSaving ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600"
        >
          <X size={12} /> 취소
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ChannelHeader({ contentCount }) {
  const { channel } = useChannel();
  const viewer = useViewer();
  const { artwork, description, setDescription, subscriberCount } = useAppStore();
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const isManager = AccessPolicy.canManageChannel(viewer, channel);

  return (
    <section>
      {/* 대표이미지(배너) — 가로 3:1 */}
      <div
        className="relative aspect-[3/1] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-amber-200 via-amber-100 to-stone-200 bg-cover bg-center"
        style={artwork.bannerUrl ? { backgroundImage: `url(${artwork.bannerUrl})` } : undefined}
      >
        {isManager && <ImageEditOverlay slot={ChannelImageSlot.BANNER} className="bottom-2 right-2" />}
      </div>

      <div className="mt-4 flex items-start gap-4">
        {/* 네모 로고 — 정사각형 */}
        <div
          className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-2xl bg-amber-700 bg-cover bg-center shadow-sm sm:w-28"
          style={artwork.logoUrl ? { backgroundImage: `url(${artwork.logoUrl})` } : undefined}
        >
          {!artwork.logoUrl && (
            <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
              {channel.name.slice(0, 1)}
            </span>
          )}
          {isManager && <ImageEditOverlay slot={ChannelImageSlot.COVER} compact className="bottom-1 right-1" />}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight text-stone-900 sm:text-2xl">{channel.name}</h1>
          <p className="mt-1 text-xs text-stone-500">
            <span className="text-stone-700">@{channel.slug}</span> · 구독자 {subscriberCount.toLocaleString()}명 · 콘텐츠{" "}
            {contentCount}개
          </p>

          {isEditingDescription ? (
            <DescriptionEditor
              initial={description}
              onSave={setDescription}
              onCancel={() => setIsEditingDescription(false)}
            />
          ) : (
            <div className="mt-1.5 flex items-start gap-1">
              {description ? (
                <button
                  type="button"
                  onClick={() => setIsDescriptionOpen((v) => !v)}
                  className={`text-left text-sm text-stone-600 ${isDescriptionOpen ? "" : "line-clamp-2"}`}
                >
                  {description}
                </button>
              ) : (
                <p className="text-sm text-stone-400">{isManager ? "채널 소개글을 입력해주세요." : ""}</p>
              )}
              {isManager && (
                <button
                  type="button"
                  onClick={() => setIsEditingDescription(true)}
                  className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                  aria-label="소개글 편집"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isManager ? (
          <>
            <Link
              href={channel.path("record")}
              className="flex items-center gap-1.5 rounded-full bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
            >
              <Clapperboard size={15} /> 콘텐츠 제작·관리
            </Link>
            <Link
              href={`${channel.path("record")}?tab=design`}
              className="flex items-center gap-1.5 rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-200"
            >
              <Palette size={15} /> 채널 꾸미기
            </Link>
          </>
        ) : AccessPolicy.canSubscribe(viewer) ? (
          <button
            type="button"
            className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white"
            title="구독 기능은 로그인 연동 후 제공됩니다"
          >
            구독
          </button>
        ) : (
          <Link
            href="/signup"
            className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            구독
          </Link>
        )}
      </div>
    </section>
  );
}
