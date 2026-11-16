"use client";

// 스튜디오 → 배너 탭(운영 채널 전용). 플랫폼 메인의 "최신 · 많이 들은 콘텐츠" 아래 배너 영역에
// 보일 배너를 올리고, 순서를 바꾸고, 글·주소를 고치거나 숨기고 지웁니다.
// 이미지는 고르는 즉시 브라우저에서 가로 5:2로 잘라 줄여 미리 보여 주고, 그 결과를 올립니다.
// 계산·저장은 lib/banners.js(BannerUpload·BannerLink·BannerOrder·BannerRepository)가 맡습니다.

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, ImagePlus, Link2, Pencil, Trash2 } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import { BannerLink, BannerOrder, BannerUpload } from "@/lib/banners";
import { ImageSpecError } from "@/lib/imageSpec";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-night-600";

/** Blob 미리보기 주소 — 바뀌거나 화면을 떠나면 정리합니다. */
function useBlobUrl(blob) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) return undefined;
    const next = URL.createObjectURL(blob);
    const timer = setTimeout(() => setUrl(next), 0);
    return () => {
      clearTimeout(timer);
      URL.revokeObjectURL(next);
    };
  }, [blob]);
  return blob ? url : null;
}

/** 배너 그림 — 메인 화면과 같은 5:2 비율, 글이 있으면 왼쪽 아래에 얹습니다. */
function BannerPicture({ imageUrl, title, className = "" }) {
  return (
    <div
      className={`relative aspect-[5/2] overflow-hidden rounded-xl bg-stone-100 bg-cover bg-center ${className}`}
      style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      role="img"
      aria-label={title || "배너"}
    >
      {title && (
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/55 to-transparent px-3 pb-2 pt-6">
          <p className="truncate text-xs font-semibold text-white">{title}</p>
        </div>
      )}
    </div>
  );
}

/** 글·주소 입력 두 칸 — 올리기와 고치기가 함께 씁니다. */
function BannerFields({ title, onTitle, link, onLink, disabled }) {
  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        placeholder="배너 위에 얹을 짧은 글 (비워도 돼요)"
        maxLength={40}
        disabled={disabled}
        className={INPUT}
      />
      <div>
        <div className="relative">
          <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={link}
            onChange={(e) => onLink(e.target.value)}
            placeholder="누르면 갈 주소 (비워도 돼요)"
            inputMode="url"
            disabled={disabled}
            className={`${INPUT} pl-9`}
          />
        </div>
        <p className="mt-1 text-[11px] text-stone-400">{BannerLink.GUIDE}</p>
      </div>
    </div>
  );
}

function UploadCard({ nextOrder, onUploaded }) {
  const { repos } = useChannel();
  const [image, setImage] = useState(null);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const preview = useBlobUrl(image);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setIsPreparing(true);
    try {
      setImage(await BannerUpload.prepare(file));
    } catch (err) {
      setImage(null);
      setError(err instanceof ImageSpecError ? err.message : "이미지를 처리하지 못했어요.");
    } finally {
      setIsPreparing(false);
    }
  }

  function reset() {
    setImage(null);
    setTitle("");
    setLink("");
  }

  async function save() {
    const linkUrl = BannerLink.normalize(link);
    if (linkUrl === null) return setError("주소를 확인해 주세요. /로 시작하는 사이트 안 주소나 https:// 주소만 돼요.");
    setIsSaving(true);
    setError("");
    const result = await repos.banners.create({ image, title, linkUrl, sortOrder: nextOrder });
    setIsSaving(false);
    if (!result.ok) return setError(`올리지 못했어요: ${result.reason}`);
    onUploaded(result.banner);
    reset();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">배너 올리기</h3>
        <ul className="mt-1.5 space-y-0.5 text-xs text-stone-500">
          {BannerUpload.guide.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </div>

      {!image ? (
        <label
          className={`flex aspect-[5/2] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 text-sm text-stone-500 hover:bg-stone-50 ${
            isPreparing ? "pointer-events-none opacity-60" : "cursor-pointer"
          }`}
        >
          <ImagePlus size={22} />
          {isPreparing ? "이미지 준비 중…" : "배너 이미지 선택하기"}
          <input type="file" accept={BannerUpload.acceptAttribute} className="hidden" onChange={pick} />
        </label>
      ) : (
        <div className="space-y-3">
          <BannerPicture imageUrl={preview} title={title.trim()} />
          <BannerFields title={title} onTitle={setTitle} link={link} onLink={setLink} disabled={isSaving} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={isSaving}
              className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600"
            >
              다른 이미지
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving}
              className="rounded-full bg-night-700 px-4 py-1.5 text-xs font-medium text-white disabled:bg-stone-300"
            >
              {isSaving ? "올리는 중…" : "배너 올리기"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}

function BannerRow({ banner, index, count, busy, onMove, onToggle, onEdit, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(banner.title);
  const [link, setLink] = useState(banner.linkUrl);
  const [error, setError] = useState("");

  async function save() {
    const linkUrl = BannerLink.normalize(link);
    if (linkUrl === null) return setError("주소를 확인해 주세요.");
    const ok = await onEdit(banner, { title, linkUrl });
    if (ok) {
      setIsEditing(false);
      setError("");
    }
  }

  const iconButton =
    "flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <li className={`rounded-2xl border border-stone-200 bg-white p-3 ${banner.isActive ? "" : "opacity-70"}`}>
      <div className="flex items-start gap-3">
        <span className="mt-1 w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-stone-400">{index + 1}</span>
        <BannerPicture imageUrl={banner.imageUrl} title={banner.title} className="w-36 shrink-0 sm:w-44" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-800">{banner.title || "글 없음"}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-stone-400">
            {banner.hasLink ? (
              <>
                {banner.isExternal ? <ExternalLink size={11} /> : <Link2 size={11} />}
                <span className="truncate">{banner.linkUrl}</span>
              </>
            ) : (
              "누를 수 없는 배너"
            )}
          </p>
          <span
            className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              banner.isActive ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
            }`}
          >
            {banner.isActive ? <Eye size={11} /> : <EyeOff size={11} />}
            {banner.isActive ? "보이는 중" : "숨김"}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-0.5">
        <button type="button" onClick={() => onMove(index, -1)} disabled={busy || index === 0} className={iconButton} aria-label="위로" title="위로">
          <ArrowUp size={15} />
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={busy || index === count - 1}
          className={iconButton}
          aria-label="아래로"
          title="아래로"
        >
          <ArrowDown size={15} />
        </button>
        <button
          type="button"
          onClick={() => onToggle(banner)}
          disabled={busy}
          className={iconButton}
          aria-label={banner.isActive ? "숨기기" : "보이기"}
          title={banner.isActive ? "숨기기" : "보이기"}
        >
          {banner.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <button
          type="button"
          onClick={() => setIsEditing((v) => !v)}
          disabled={busy}
          className={iconButton}
          aria-label="글·주소 고치기"
          title="글·주소 고치기"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(banner)}
          disabled={busy}
          className={`${iconButton} hover:bg-red-50 hover:text-red-600`}
          aria-label="지우기"
          title="지우기"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {isEditing && (
        <div className="mt-2 space-y-2 rounded-xl bg-stone-50 p-3">
          <BannerFields title={title} onTitle={setTitle} link={link} onLink={setLink} disabled={busy} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600"
            >
              취소
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-full bg-night-700 px-3 py-1.5 text-xs font-medium text-white disabled:bg-stone-300"
            >
              저장
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function BannerStudioPanel() {
  const { repos } = useChannel();
  const [banners, setBanners] = useState([]);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let cancelled = false;
    repos.banners.list({ includeHidden: true }).then((result) => {
      if (cancelled) return;
      setBanners(result.banners || []);
      if (!result.ok) setError(`배너를 불러오지 못했어요: ${result.reason}`);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  async function move(index, delta) {
    const next = BannerOrder.move(banners, index, delta);
    if (next === banners) return;
    const previous = banners;
    setBanners(next);
    setBusyId("order");
    const result = await repos.banners.saveOrder(next);
    setBusyId(null);
    if (!result.ok) {
      setBanners(previous);
      setError(`순서를 바꾸지 못했어요: ${result.reason}`);
    }
  }

  async function update(banner, patch) {
    setBusyId(banner.id);
    setError("");
    const result = await repos.banners.update(banner.id, patch);
    setBusyId(null);
    if (!result.ok) {
      setError(`바꾸지 못했어요: ${result.reason}`);
      return false;
    }
    setBanners((list) => list.map((b) => (b.id === banner.id ? result.banner : b)));
    return true;
  }

  async function remove(banner) {
    if (!window.confirm("이 배너를 지울까요? 이미지도 함께 지워지고 되돌릴 수 없어요.")) return;
    setBusyId(banner.id);
    const result = await repos.banners.remove(banner);
    setBusyId(null);
    if (!result.ok) return setError(`지우지 못했어요: ${result.reason}`);
    setBanners((list) => list.filter((b) => b.id !== banner.id));
  }

  const activeCount = banners.filter((b) => b.isActive).length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">
        플랫폼 메인의 &quot;최신 · 많이 들은 콘텐츠&quot; 아래에 보이는 배너예요. 보이는 배너가 여러 장이면 위 순서대로
        옆으로 넘겨져요.
      </p>

      <UploadCard nextOrder={banners.length} onUploaded={(banner) => setBanners((list) => [...list, banner])} />

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">{error}</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-stone-900">
          올린 배너 <span className="font-normal text-stone-400">· 보이는 중 {activeCount}장</span>
        </h3>
        {isLoading ? (
          <p className="py-6 text-center text-xs text-stone-400">불러오는 중…</p>
        ) : banners.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-xs text-stone-400">
            아직 올린 배너가 없어요. 배너가 없으면 메인 화면에 배너 영역이 보이지 않아요.
          </p>
        ) : (
          <ul className="space-y-2">
            {banners.map((banner, i) => (
              <BannerRow
                key={banner.id}
                banner={banner}
                index={i}
                count={banners.length}
                busy={busyId !== null}
                onMove={move}
                onToggle={(b) => update(b, { status: b.isActive ? "hidden" : "active" })}
                onEdit={update}
                onDelete={remove}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
