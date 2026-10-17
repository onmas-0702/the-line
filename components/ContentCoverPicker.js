"use client";

// 콘텐츠 배경이미지 고르기 — 새 이미지 올리기 / 라이브러리에서 고르기 / 채널 기본 이미지로.
// 고른 결과는 ContentCoverChoice(불변)로 onChange에 넘기고, 실제 저장(라이브러리 보관)은
// 저장 버튼을 누를 때 ContentCoverChoice.commit()이 합니다.

import { useEffect, useState } from "react";
import { ImagePlus, Library, RotateCcw, X } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import { useViewer } from "@/components/ViewerProvider";
import { AccessPolicy } from "@/lib/access";
import { ContentCoverChoice } from "@/lib/contentCover";
import { ImageSpec, ImageSpecError } from "@/lib/imageSpec";
import { AssetKind } from "@/lib/library";
import { useAppStore } from "@/lib/store";

const SPEC = ImageSpec.CONTENT_COVER;

function LibrarySheet({ onPick, onClose }) {
  const { channel, repos } = useChannel();
  const viewer = useViewer();
  const [tab, setTab] = useState("mine");
  const [state, setState] = useState({ status: "loading", mine: [], shared: [], importedIds: new Set() });
  const [busyId, setBusyId] = useState(null);

  // 열릴 때 내 라이브러리와 공용 라이브러리를 한 번 불러옵니다.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      repos.library.listForChannel({ kind: AssetKind.BACKGROUND_IMAGE }),
      repos.library.listShared({ kind: AssetKind.BACKGROUND_IMAGE }),
    ]).then(([mine, shared]) => {
      if (cancelled) return;
      if (!mine.ok && !shared.ok) {
        setState({ status: "unavailable", mine: [], shared: [], importedIds: new Set() });
        return;
      }
      const owned = mine.owned || [];
      const imported = mine.imported || [];
      setState({
        status: "ready",
        mine: [...owned, ...imported].filter((a) => a.displayUrl && a.status === "active"),
        // 운영 채널은 자기 자산이 곧 공용 자산이라 "공용" 탭에서 자기 것을 빼고 보여줍니다.
        shared: (shared.assets || []).filter((a) => a.displayUrl && a.ownerChannelId !== channel.id),
        importedIds: new Set(imported.map((a) => a.id)),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [repos, channel.id]);

  async function pickShared(asset) {
    if (!state.importedIds.has(asset.id)) {
      setBusyId(asset.id);
      const result = await repos.library.importToChannel(asset.id);
      setBusyId(null);
      if (!result.ok) return;
    }
    onPick(asset);
  }

  const list = tab === "mine" ? state.mine : state.shared;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-stone-900">라이브러리에서 배경이미지 고르기</p>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-stone-400 hover:bg-stone-100" aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex gap-1 rounded-full bg-stone-100 p-1 text-xs">
          {[
            ["mine", "내 라이브러리"],
            ["shared", "공용 라이브러리"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`flex-1 rounded-full py-1.5 ${tab === value ? "bg-white font-semibold text-stone-900 shadow-sm" : "text-stone-500"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-40 overflow-y-auto">
          {state.status === "loading" && <p className="py-10 text-center text-xs text-stone-400">불러오는 중…</p>}
          {state.status === "unavailable" && (
            <p className="py-10 text-center text-xs leading-relaxed text-stone-400">
              라이브러리는 DB 업데이트(마이그레이션 0006·0011·0012) 후에 쓸 수 있어요.
              <br />
              지금은 &ldquo;새 이미지 올리기&rdquo;를 이용해주세요.
            </p>
          )}
          {state.status === "ready" && list.length === 0 && (
            <p className="py-10 text-center text-xs text-stone-400">
              {tab === "mine" ? "아직 보관된 배경이미지가 없어요. 새 이미지를 올리면 여기에 모여요." : "아직 공용 배경이미지가 없어요."}
            </p>
          )}
          {state.status === "ready" && list.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {list.map((asset) => {
                const canUse = tab === "mine" || AccessPolicy.canImportAsset(viewer, channel, asset);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => (tab === "mine" ? onPick(asset) : pickShared(asset))}
                    disabled={!canUse || busyId === asset.id}
                    className="group relative aspect-square overflow-hidden rounded-xl bg-stone-100 bg-cover bg-center disabled:opacity-50"
                    style={{ backgroundImage: `url(${asset.displayUrl})` }}
                    title={asset.name}
                  >
                    {tab === "shared" && !state.importedIds.has(asset.id) && (
                      <span className="absolute inset-x-1 bottom-1 rounded-full bg-black/55 py-0.5 text-[10px] text-white">
                        {busyId === asset.id ? "가져오는 중…" : "가져와서 쓰기"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ContentCoverPicker({ value, onChange, disabled = false }) {
  const { artwork } = useAppStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setIsProcessing(true);
    try {
      onChange(ContentCoverChoice.fromNewImage(file, await SPEC.process(file)));
    } catch (err) {
      setError(err instanceof ImageSpecError ? err.message : "이미지를 처리하지 못했어요.");
    } finally {
      setIsProcessing(false);
    }
  }

  const previewUrl = value.previewUrl || artwork.thumbnailUrl;
  const busy = disabled || isProcessing;

  return (
    <div className="flex items-start gap-4">
      <div className="w-28 shrink-0">
        <div
          className={`aspect-square w-full rounded-2xl bg-gradient-to-br from-amber-200 to-amber-400 bg-cover bg-center ${value.hasImage ? "" : "opacity-60"}`}
          style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}
          role="img"
          aria-label="배경이미지 미리보기"
        />
        <p className="mt-1.5 text-center text-[11px] text-stone-400">
          {value.hasImage ? "이 콘텐츠의 배경이미지" : "채널 기본 배경 이미지"}
        </p>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          <label
            className={`flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 ${
              busy ? "pointer-events-none opacity-50" : "cursor-pointer"
            }`}
          >
            <ImagePlus size={13} /> {isProcessing ? "맞추는 중…" : "새 이미지 올리기"}
            <input type="file" accept={SPEC.acceptAttribute} className="hidden" onChange={handleFile} />
          </label>
          <button
            type="button"
            onClick={() => setIsLibraryOpen(true)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50"
          >
            <Library size={13} /> 라이브러리에서 고르기
          </button>
          {value.hasImage && (
            <button
              type="button"
              onClick={() => onChange(ContentCoverChoice.none())}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50"
            >
              <RotateCcw size={13} /> 기본 표지로
            </button>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-stone-400">
          카드 표지·재생 화면에 쓰여요. 정사각형으로 맞춰 보여주고, 올린 원본은 그대로 라이브러리에
          보관돼서 다음 콘텐츠에서도 다시 고를 수 있어요.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {isLibraryOpen && (
        <LibrarySheet
          onPick={(asset) => {
            onChange(ContentCoverChoice.fromAsset(asset));
            setIsLibraryOpen(false);
          }}
          onClose={() => setIsLibraryOpen(false)}
        />
      )}
    </div>
  );
}
