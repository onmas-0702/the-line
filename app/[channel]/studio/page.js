"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";
import CommunityPanel from "@/components/studio/CommunityPanel";
import BannerStudioPanel from "@/components/studio/BannerStudioPanel";
import GalleryStudioPanel from "@/components/studio/GalleryStudioPanel";
import StaffPanel from "@/components/studio/StaffPanel";
import StudioTabBar from "@/components/studio/StudioTabBar";
import AudioWorkbench from "@/components/studio/AudioWorkbench";
import PublishTimePicker from "@/components/studio/PublishTimePicker";
import { SaveDraftBar, SavedDraftsList } from "@/components/studio/DraftControls";
import { useAudioDrafts } from "@/components/studio/useAudioDrafts";
import { useAudioWorkbench } from "@/components/studio/useAudioWorkbench";
import ScriptAttachField from "@/components/studio/ScriptAttachField";
import { useViewer } from "@/components/ViewerProvider";
import { AccessPolicy } from "@/lib/access";
import { FeatureFlags } from "@/lib/featureFlags";
import { ScriptChoice } from "@/lib/contentScript";
import { StudioTab } from "@/lib/staff";
import ContentCoverPicker from "@/components/ContentCoverPicker";
import DesignSkinPanel from "@/components/DesignSkinPanel";
import ManageContentPanel from "@/components/ManageContentPanel";
import { TimeFormat } from "@/lib/audio";
import { useChannel } from "@/components/ChannelProvider";
import { AudioMetadata } from "@/lib/audioStorage";
import { ContentCoverChoice } from "@/lib/contentCover";
import { PublishSchedule } from "@/lib/publishing";
import { useAppStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export default function RecordPage() {
  const { addAudio, addAudioFromRow, updateAudioLocal } = useAppStore();
  const { channel, repos } = useChannel();

  // 페이지 최상단 탭: 제작(녹음/편집/저장) / 콘텐츠 관리(업로드한 것 삭제·편집) /
  // 디자인(채널 꾸미기: 대표이미지·로고·기본 배경 이미지).
  // 채널 페이지의 "채널 꾸미기" 버튼은 ?tab=design으로 디자인 탭을 바로 엽니다.
  // 운영자마다 맡은 기능의 탭만 보입니다(StudioTab, 소유자는 모두 + 운영자 관리).
  const viewer = useViewer();
  const visibleTabs = StudioTab.visibleFor({
    canUse: (key) => AccessPolicy.canUseStudio(viewer, channel, key),
    isOwner: AccessPolicy.canManageStaff(viewer, channel),
    isPlatform: channel.isPlatform,
  });
  const requestedTab = useSearchParams().get("tab");
  const [selectedTab, setMainTab] = useState(requestedTab);
  const mainTab = visibleTabs.some((t) => t.key === selectedTab) ? selectedTab : visibleTabs[0]?.key;
  // 녹음·업로드·편집·배경음악 — 콘텐츠 관리의 "다시 편집"과 같은 작업대를 씁니다.
  const workbench = useAudioWorkbench();

  // 메타데이터 — 나중에 검색에 쓰일 수 있도록 기본 항목을 받아둡니다.
  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [description, setDescription] = useState("");
  const [script, setScript] = useState(() => ScriptChoice.of());
  const scriptFile = script.fileToSave;
  // 콘텐츠 배경이미지 — 고르지 않으면 채널 기본 배경 이미지를 씁니다(로고는 쓰지 않음).
  const [coverChoice, setCoverChoice] = useState(() => ContentCoverChoice.none());
  // 공개 시점 — 바로 공개 / 예약 공개(그 시각에 공개 + 구독자 알림)
  const [publish, setPublish] = useState(() => PublishSchedule.now());

  const [savedMessage, setSavedMessage] = useState(""); // 저장 완료 안내(바로 공개 / 예약)
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const clipCount = workbench.clips.length;

  // 작업 저장하기 — 업로드와 별개로 편집 상태를 DB에 저장했다가 불러와 이어서 작업(0022).
  const drafts = useAudioDrafts({
    repository: repos.drafts,
    workbench,
    getMeta: () => ({ title, tagsInput, description, publish }),
    applyMeta: (meta) => {
      setTitle(meta.title);
      setTagsInput(meta.tagsInput);
      setDescription(meta.description);
      setPublish(meta.publish);
    },
  });

  function resetForm() {
    workbench.reset();
    setTitle("");
    setTagsInput("");
    setDescription("");
    setScript(ScriptChoice.of());
    setCoverChoice(ContentCoverChoice.none());
    setPublish(PublishSchedule.now());
  }

  /** 서버에 못 올렸거나 서버가 없을 때 이 브라우저에만 남겨 둡니다. */
  function keepLocally(render, coverResult, resolvedTitle) {
    addAudio({
      coverImageUrl: coverResult.displayUrl,
      title: resolvedTitle,
      hasScript: Boolean(scriptFile),
      scriptFileName: scriptFile?.name || "",
      duration: TimeFormat.duration(render.durationSeconds),
      previewUrl: URL.createObjectURL(render.mixBlob()),
    });
  }

  async function handleSave() {
    if (clipCount === 0) return;
    const publishProblem = publish.problem();
    if (publishProblem) {
      setSaveError(publishProblem);
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      // 남은 빈 공간은 빼고("자동으로 붙이기"와 같은 효과), 미리듣기와 같은 믹서로 만듭니다.
      const render = await workbench.render();
      if (!render) return;
      const resolvedTitle = title.trim() || "제목 없는 나눔";
      // 새 배경이미지는 여기서 라이브러리에 보관(원본 + 화면용)하고, 콘텐츠에 넣을 값을 받습니다.
      const coverResult = await coverChoice.commit(repos.library, { name: resolvedTitle });
      const coverNotice =
        coverChoice.hasImage && !coverResult.archived
          ? " 배경이미지는 DB 업데이트(마이그레이션 0006·0011·0012) 전이라 이 탭에서만 보여요."
          : "";

      if (!isSupabaseConfigured) {
        keepLocally(render, coverResult, resolvedTitle);
      } else {
        const metadata = new AudioMetadata({
          title: resolvedTitle,
          tags: AudioMetadata.parseTags(tagsInput),
          description: description.trim(),
          durationSeconds: render.durationSeconds,
          source: workbench.hasRecordedClip ? "recorded" : "uploaded",
        });
        const result = await repos.audios.upload({
          wavBlob: render.mixBlob(),
          voiceBlob: render.voiceBlob(),
          editSettings: render.settings,
          scriptFile,
          metadata,
          cover: coverResult.cover,
          publish,
        });
        if (result.ok) {
          addAudioFromRow(result.row);
          drafts.finishAfterUpload(); // 이어서 작업하던 저장본은 업로드했으니 정리
          // 서버에 배경이미지를 저장하지 못했으면(마이그레이션 전) 이 탭에서만이라도 보여줍니다.
          if (coverResult.displayUrl && (result.coverSkipped || !coverResult.cover)) {
            updateAudioLocal(result.row.id, { coverImageUrl: coverResult.displayUrl });
            setSaveError(coverNotice.trim() || "배경이미지는 DB 업데이트 전이라 이 탭에서만 보여요.");
          }
        } else {
          // 서버 저장에 실패해도 방금 만든 결과물을 잃지 않도록, 이 브라우저에만이라도 남겨둡니다.
          setSaveError(`서버 저장에 실패해서 이 브라우저에만 임시로 저장했어요. (${result.reason})`);
          keepLocally(render, coverResult, resolvedTitle);
        }
      }

      setSavedMessage(
        publish.isScheduled && isSupabaseConfigured
          ? `예약했어요. ${publish.label}에 공개되고, 알림을 켠 구독자에게 알림이 가요. (콘텐츠 관리에서 바꿀 수 있어요)`
          : publish.isPrivate
            ? "비공개로 저장했어요. 운영자에게만 보이고, 콘텐츠 관리에서 언제든 공개할 수 있어요."
            : "저장되었습니다. 홈 화면에서 바로 확인할 수 있어요."
      );
      resetForm();
      setTimeout(() => setSavedMessage(""), 6000);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-stone-900">스튜디오</h1>
        <p className="mt-1 text-sm text-stone-500">
          나눔을 녹음·편집·저장하고, 채널 꾸미기와 구독자 {FeatureFlags.OPEN_CHAT ? "공지·오픈채팅" : "공지"}을 관리하세요.
        </p>
      </div>

      <StudioTabBar tabs={visibleTabs} active={mainTab} onSelect={setMainTab} />

      {visibleTabs.length === 0 ? (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-500">
          아직 맡은 기능이 없어요. 채널 소유자에게 기능을 맡겨 달라고 요청해 주세요.
        </p>
      ) : mainTab === "staff" ? (
        <StaffPanel />
      ) : mainTab === "gallery" ? (
        <GalleryStudioPanel />
      ) : mainTab === "banner" ? (
        <BannerStudioPanel />
      ) : mainTab === "community" ? (
        <CommunityPanel />
      ) : mainTab === "design" ? (
        <DesignSkinPanel />
      ) : mainTab === "manage" ? (
        <ManageContentPanel />
      ) : (
      <>
      <SavedDraftsList drafts={drafts} />

      <AudioWorkbench
        workbench={workbench}
        afterTimeline={<SaveDraftBar drafts={drafts} isDirty={workbench.isDirty} hasClips={clipCount > 0} />}
        intro={
          !isSupabaseConfigured && (
            <p className="mt-1 text-xs text-night-600">
              서버(Supabase)가 아직 연결되지 않아 지금은 이 브라우저에만 임시로 저장됩니다.
            </p>
          )
        }
      />

      <section>
        <h2 className="text-base font-semibold text-stone-900">배경이미지</h2>
        <p className="mt-1 text-xs text-stone-400">
          이 콘텐츠의 카드 표지와 재생 화면에 쓰일 이미지예요. 고르지 않으면 채널 기본 배경 이미지가 쓰여요.
        </p>
        <div className="mt-3">
          <ContentCoverPicker value={coverChoice} onChange={setCoverChoice} disabled={isSaving} />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">나눔 정보</h2>
        <p className="mt-1 text-xs text-stone-400">
          제목·태그·설명은 검색에 쓰입니다. 제목 외에는 비워둬도 저장할 수 있어요.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-stone-500">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="나눔 제목을 입력하세요"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-night-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-stone-500">태그 (쉼표로 구분)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="예: 순종, 은혜, 위로"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-night-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-stone-500">간단한 설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="이 나눔을 한두 문장으로 소개해주세요 (검색에 쓰입니다)"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-night-500 focus:outline-none"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">대본 첨부</h2>
        <div className="mt-3">
          <ScriptAttachField value={script} onChange={setScript} onReject={setSaveError} disabled={isSaving} />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">공개 시점</h2>
        <div className="mt-3">
          <PublishTimePicker value={publish} onChange={setPublish} disabled={isSaving} />
        </div>
      </section>

      {saveError && (
        <div className="flex items-center gap-2 rounded-xl bg-night-50 px-4 py-3 text-sm text-night-700">
          <AlertCircle size={16} /> {saveError}
        </div>
      )}

      {savedMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> {savedMessage}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={clipCount === 0 || isSaving}
          className="rounded-full bg-night-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-night-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isSaving ? "믹싱 중…" : publish.isScheduled ? "예약 업로드" : publish.isPrivate ? "비공개로 업로드" : "업로드"}
        </button>
      </div>
      </>
      )}
    </div>
  );
}
