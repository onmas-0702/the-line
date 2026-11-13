"use client";

// 스튜디오 → 갤러리 탭(운영 채널 전용). 플랫폼 메인 하단 "이미지 갤러리"에 올릴 이미지를
// 올리고, 제목을 고치거나 숨기고 지웁니다. 이미지를 고르면 GalleryUpload가 브라우저에서
// 크게 보기용·썸네일·모바일 배경이미지를 만들어 미리 보여주고, 원본은 그대로 보관합니다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import { GalleryUpload } from "@/lib/gallery";
import { ImageSpecError } from "@/lib/imageSpec";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-night-600";

/** 고른 파일에서 만든 미리보기 주소들(blob:) — 바뀌거나 화면을 떠나면 정리합니다. */
function useUploadPreviews(upload) {
  const [urls, setUrls] = useState(null);
  useEffect(() => {
    if (!upload) return undefined;
    const next = {
      thumb: URL.createObjectURL(upload.thumb),
      wallpaper: URL.createObjectURL(upload.wallpaper),
    };
    const timer = setTimeout(() => setUrls(next), 0);
    return () => {
      clearTimeout(timer);
      URL.revokeObjectURL(next.thumb);
      URL.revokeObjectURL(next.wallpaper);
    };
  }, [upload]);
  return upload ? urls : null;
}

function UploadCard({ onUploaded }) {
  const { repos } = useChannel();
  const [upload, setUpload] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const previews = useUploadPreviews(upload);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setIsPreparing(true);
    try {
      setUpload(await GalleryUpload.prepare(file));
      setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      setUpload(null);
      setError(err instanceof ImageSpecError ? err.message : "이미지를 처리하지 못했어요.");
    } finally {
      setIsPreparing(false);
    }
  }

  function reset() {
    setUpload(null);
    setTitle("");
    setDescription("");
  }

  async function save() {
    setIsSaving(true);
    setError("");
    const result = await repos.gallery.create({ title, description, upload });
    setIsSaving(false);
    if (!result.ok) {
      setError(`올리지 못했어요: ${result.reason}`);
      return;
    }
    onUploaded(result.image);
    reset();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">이미지 올리기</h3>
        <ul className="mt-1.5 space-y-0.5 text-xs text-stone-500">
          {GalleryUpload.guide.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </div>

      {!upload ? (
        <label
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 py-8 text-sm text-stone-500 hover:bg-stone-50 ${
            isPreparing ? "pointer-events-none opacity-60" : "cursor-pointer"
          }`}
        >
          <ImagePlus size={22} />
          {isPreparing ? "이미지 준비 중…" : "이미지 선택하기"}
          <input type="file" accept={GalleryUpload.acceptAttribute} className="hidden" onChange={pick} />
        </label>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="w-28">
              <div
                className="aspect-square w-full rounded-xl bg-stone-100 bg-cover bg-center"
                style={previews ? { backgroundImage: `url(${previews.thumb})` } : undefined}
                role="img"
                aria-label="썸네일 미리보기"
              />
              <p className="mt-1 text-center text-[11px] text-stone-400">썸네일</p>
            </div>
            <div className="w-16">
              <div
                className="aspect-[1170/2532] w-full rounded-xl bg-stone-100 bg-cover bg-center"
                style={previews ? { backgroundImage: `url(${previews.wallpaper})` } : undefined}
                role="img"
                aria-label="모바일 배경이미지 미리보기"
              />
              <p className="mt-1 text-center text-[11px] text-stone-400">모바일 배경</p>
            </div>
            <p className="pb-5 text-[11px] text-stone-400">
              원본 {upload.width}×{upload.height}px
            </p>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" className={INPUT} />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="짧은 설명(선택) — 예: 성경 구절, 촬영 장소"
            className={INPUT}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={isSaving}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving}
              className="rounded-full bg-night-700 px-4 py-2 text-sm font-medium text-white hover:bg-night-800 disabled:bg-stone-300"
            >
              {isSaving ? "올리는 중…" : "갤러리에 올리기"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}

function ImageRow({ image, onChanged, onRemoved }) {
  const { repos } = useChannel();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(image.title);
  const [description, setDescription] = useState(image.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(task) {
    setBusy(true);
    setError("");
    const result = await task();
    setBusy(false);
    if (!result.ok) setError(`처리하지 못했어요: ${result.reason}`);
    return result;
  }

  async function saveText() {
    const result = await run(() => repos.gallery.update(image.id, { title, description }));
    if (result.ok) {
      onChanged(result.image);
      setIsEditing(false);
    }
  }

  async function toggleHidden() {
    const result = await run(() => repos.gallery.update(image.id, { status: image.isHidden ? "active" : "hidden" }));
    if (result.ok) onChanged(result.image);
  }

  async function remove() {
    if (!window.confirm(`"${image.displayTitle}"을(를) 갤러리에서 지울까요? 구독자의 마이 갤러리에서도 사라지고 되돌릴 수 없어요.`)) return;
    const result = await run(() => repos.gallery.remove(image));
    if (result.ok) onRemoved(image.id);
  }

  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div
          className={`aspect-square w-16 shrink-0 rounded-xl bg-stone-100 bg-cover bg-center ${image.isHidden ? "opacity-40" : ""}`}
          style={{ backgroundImage: `url(${image.thumbUrl})` }}
          role="img"
          aria-label={image.displayTitle}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-900">{image.displayTitle}</p>
          <p className="mt-0.5 text-xs text-stone-400">
            {image.createdAt.slice(0, 10)} · {image.width}×{image.height}px
            {image.isHidden && <span className="ml-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-stone-500">숨김</span>}
          </p>
          {!image.isHidden && (
            <Link href={image.path} className="mt-1 inline-block text-xs text-night-700 hover:underline">
              갤러리에서 보기
            </Link>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setIsEditing((v) => !v)} disabled={busy} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label="제목 수정">
            <Pencil size={15} />
          </button>
          <button type="button" onClick={toggleHidden} disabled={busy} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label={image.isHidden ? "다시 공개" : "숨기기"} title={image.isHidden ? "다시 공개" : "숨기기"}>
            {image.isHidden ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button type="button" onClick={remove} disabled={busy} className="rounded-full p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label="삭제">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {isEditing && (
        <div className="mt-3 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" className={INPUT} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="짧은 설명(선택)" className={INPUT} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsEditing(false)} className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600">
              취소
            </button>
            <button type="button" onClick={saveText} disabled={busy} className="rounded-full bg-night-700 px-3 py-1.5 text-xs font-medium text-white disabled:bg-stone-300">
              저장
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}

export default function GalleryStudioPanel() {
  const { repos } = useChannel();
  const [state, setState] = useState({ images: [], isLoading: isSupabaseConfigured, reason: "" });

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let cancelled = false;
    repos.gallery.list({ includeHidden: true }).then((result) => {
      if (!cancelled) setState({ images: result.images, isLoading: false, reason: result.ok ? "" : result.reason });
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  if (!isSupabaseConfigured) {
    return <p className="text-sm text-stone-500">서버(Supabase)를 연결하면 이미지 갤러리를 관리할 수 있어요.</p>;
  }

  const replace = (image) => setState((prev) => ({ ...prev, images: prev.images.map((i) => (i.id === image.id ? image : i)) }));
  const removeById = (id) => setState((prev) => ({ ...prev, images: prev.images.filter((i) => i.id !== id) }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-stone-900">이미지 갤러리</h2>
        <p className="mt-1 text-xs text-stone-500">
          플랫폼 메인 하단의 이미지 갤러리에 보여요. 누구나 볼 수 있고, 구독자만 원본·모바일 배경이미지로
          받거나 마이 갤러리에 담을 수 있어요.
        </p>
      </div>

      <UploadCard onUploaded={(image) => setState((prev) => ({ ...prev, images: [image, ...prev.images] }))} />

      <section>
        <h3 className="text-sm font-semibold text-stone-900">올린 이미지 {state.images.length > 0 && `(${state.images.length})`}</h3>
        {state.isLoading ? (
          <p className="py-6 text-center text-sm text-stone-400">불러오는 중…</p>
        ) : state.reason ? (
          <p className="py-6 text-center text-sm text-stone-400">
            불러오지 못했어요. DB 업데이트(마이그레이션 0019)를 적용했는지 확인해 주세요.
          </p>
        ) : state.images.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">아직 올린 이미지가 없어요.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {state.images.map((image) => (
              <ImageRow key={image.id} image={image} onChanged={replace} onRemoved={removeById} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
