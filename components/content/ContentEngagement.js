"use client";

// 콘텐츠 화면 아래쪽 — 아이콘 한 줄(좋아요·담아두기·감상일기·댓글·공유하기)과, 누르면 펼쳐지는 감상일기·댓글.
// 누가 무엇을 할 수 있는지는 FeatureGate/AccessPolicy(lib/access.js)가 정하고,
// 저장은 채널 저장소(useChannel().repos)가 합니다.

import { useEffect, useState } from "react";
import { Bookmark, Flag, Heart, MessageCircleMore, MoreHorizontal, NotebookPen, Send, Trash2, UserX } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import GatePrompt from "@/components/common/GatePrompt";
import ShareArrowIcon from "@/components/content/ShareArrowIcon";
import { useViewer } from "@/components/ViewerProvider";
import { AccessPolicy, FeatureGate } from "@/lib/access";
import { AudioMarkKind, AudioMarks, CommentDraft, CommentText, JournalDraft } from "@/lib/engagement";
import { BlockList, ReportDraft, ReportReason } from "@/lib/moderation";
import { ContentShare } from "@/lib/playback";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const Feature = FeatureGate.Feature;

/** 배경이미지 위(어두운 화면)인지에 따라 글자색을 고릅니다. */
class Tone {
  constructor(isImmersive) {
    this.isImmersive = isImmersive;
  }
  get text() {
    return this.isImmersive ? "text-white" : "text-stone-800";
  }
  get muted() {
    return this.isImmersive ? "text-white/70" : "text-stone-400";
  }
  get panel() {
    return this.isImmersive ? "bg-black/30 backdrop-blur-sm" : "bg-white border border-stone-200";
  }
  get input() {
    return this.isImmersive
      ? "bg-white/15 text-white placeholder:text-white/60 border-white/20"
      : "bg-white text-stone-800 placeholder:text-stone-400 border-stone-300";
  }
  icon(active) {
    if (this.isImmersive) return active ? "bg-white/35 text-white" : "bg-white/15 text-white hover:bg-white/25";
    return active ? "bg-night-700 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200";
  }
  chip(active) {
    if (this.isImmersive) return active ? "bg-white/35 text-white" : "bg-white/15 text-white hover:bg-white/25";
    return active ? "bg-night-700 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200";
  }
}

const Panel = Object.freeze({ JOURNAL: "journal", COMMENTS: "comments" });

export default function ContentEngagement({ item, isImmersive }) {
  const tone = new Tone(isImmersive);
  const { repos } = useChannel();
  const viewer = useViewer();
  const [panel, setPanel] = useState(null); // 펼친 것: 감상일기 / 댓글 / 없음
  const [comments, setComments] = useState([]);
  const [blocks, setBlocks] = useState(BlockList.EMPTY); // 내가 차단한 사람들 — 그 댓글은 안 보임
  const shownComments = blocks.visible(comments);

  useEffect(() => {
    if (!isSupabaseConfigured || !viewer.userId) return undefined;
    let cancelled = false;
    repos.blocks.blockListFor(viewer.userId).then((list) => {
      if (!cancelled) setBlocks(list);
    });
    return () => {
      cancelled = true;
    };
  }, [repos, viewer.userId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let cancelled = false;
    repos.comments.listFor(item.id).then((result) => {
      if (!cancelled) setComments(result.comments);
    });
    return () => {
      cancelled = true;
    };
  }, [repos, item.id]);

  const toggle = (name) => setPanel((open) => (open === name ? null : name));

  return (
    <div className="space-y-4 px-2 pb-4">
      <ActionIcons item={item} tone={tone} panel={panel} commentCount={shownComments.length} onToggle={toggle} />
      {panel === Panel.JOURNAL && <JournalPanel item={item} tone={tone} />}
      {panel === Panel.COMMENTS && (
        <CommentPanel
          item={item}
          tone={tone}
          comments={shownComments}
          allComments={comments}
          onChange={setComments}
          onBlocked={(userId) => setBlocks((list) => list.with(userId))}
        />
      )}
    </div>
  );
}

/** 동그란 아이콘 버튼 — 글자 대신 아이콘(이름은 aria-label·title로), 숫자가 있으면 옆에 작게. */
function IconAction({ icon: Icon, label, count = 0, active = false, filled = false, disabled = false, onClick, tone }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={count ? `${label} ${count}` : label}
      aria-pressed={active}
      title={label}
      className={`flex h-10 min-w-10 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium tabular-nums transition disabled:opacity-50 ${tone.icon(active)}`}
    >
      <Icon size={19} strokeWidth={1.75} fill={filled ? "currentColor" : "none"} aria-hidden />
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

function ActionIcons({ item, tone, panel, commentCount, onToggle }) {
  const viewer = useViewer();
  const { repos } = useChannel();
  const [marks, setMarks] = useState(new AudioMarks());
  const [error, setError] = useState("");
  const [shareNote, setShareNote] = useState("");
  const likeGate = FeatureGate.check(viewer, Feature.LIKE);
  const saveGate = FeatureGate.check(viewer, Feature.SAVE);
  const journalGate = FeatureGate.check(viewer, Feature.JOURNAL);
  const ready = isSupabaseConfigured;

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    repos.marks.stateFor(item.id, viewer.userId).then((result) => {
      if (!cancelled) setMarks(result.marks);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, repos, item.id, viewer.userId]);

  async function toggleMark(kind) {
    const next = marks.toggled(kind);
    setMarks(next); // 먼저 화면에 반영하고, 실패하면 되돌립니다
    setError("");
    const result = await repos.marks.set({ audioId: item.id, userId: viewer.userId, kind, on: next.has(kind) });
    if (!result.ok) {
      setMarks(marks);
      setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function share() {
    const outcome = await ContentShare.share({ title: item.title, url: window.location.href });
    const note = outcome === "copied" ? "주소를 복사했어요." : outcome === "failed" ? "공유하지 못했어요." : "";
    setShareNote(note);
    if (note) setTimeout(() => setShareNote(""), 2500);
  }

  const firstBlocked = ready ? [likeGate, saveGate, journalGate].find((g) => !g.allowed) : null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {ready && (
          <>
            <IconAction
              icon={Heart}
              label="좋아요"
              count={marks.likeCount}
              active={marks.liked}
              filled={marks.liked}
              disabled={!likeGate.allowed}
              onClick={() => toggleMark(AudioMarkKind.LIKE)}
              tone={tone}
            />
            <IconAction
              icon={Bookmark}
              label="담아두기"
              active={marks.saved}
              filled={marks.saved}
              disabled={!saveGate.allowed}
              onClick={() => toggleMark(AudioMarkKind.SAVE)}
              tone={tone}
            />
            <IconAction
              icon={NotebookPen}
              label="감상일기"
              active={panel === Panel.JOURNAL}
              disabled={!journalGate.allowed}
              onClick={() => onToggle(Panel.JOURNAL)}
              tone={tone}
            />
            <IconAction
              icon={MessageCircleMore}
              label="댓글"
              count={commentCount}
              active={panel === Panel.COMMENTS}
              onClick={() => onToggle(Panel.COMMENTS)}
              tone={tone}
            />
          </>
        )}
        <IconAction icon={ShareArrowIcon} label="공유하기" onClick={share} tone={tone} />
      </div>
      {shareNote && <p className={`text-xs ${tone.muted}`}>{shareNote}</p>}
      {firstBlocked && (
        <GatePrompt
          gate={firstBlocked}
          action={firstBlocked.needs === "signin" ? "좋아요 남기기" : "담아두기·감상일기 쓰기"}
          tone={tone.isImmersive ? "dark" : "light"}
        />
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function JournalPanel({ item, tone }) {
  const viewer = useViewer();
  const { repos } = useChannel();
  const [draft, setDraft] = useState(new JournalDraft());
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    repos.journal.listForAudio(item.id).then((result) => {
      if (!cancelled) setEntries(result.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [repos, item.id]);

  async function save() {
    setBusy(true);
    setError("");
    const result = await repos.journal.add({ audioId: item.id, userId: viewer.userId, draft });
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setEntries((prev) => [result.entry, ...prev]);
    setDraft(new JournalDraft());
  }

  return (
    <div className={`rounded-2xl p-4 text-left ${tone.panel}`}>
      <p className={`text-sm font-semibold ${tone.text}`}>이 메시지를 듣고</p>
      <p className={`mt-0.5 text-xs ${tone.muted}`}>나만 볼 수 있어요. 마이 페이지 → 감상일기에서 다시 볼 수 있어요.</p>
      <textarea
        value={draft.body}
        onChange={(e) => setDraft(new JournalDraft(e.target.value))}
        rows={4}
        maxLength={JournalDraft.MAX_LENGTH}
        placeholder="오늘 마음에 남은 말씀, 떠오른 생각을 적어보세요."
        className={`mt-3 w-full rounded-xl border px-3 py-2 text-sm outline-none ${tone.input}`}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-full bg-night-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-night-800 disabled:opacity-60"
        >
          {busy ? "저장 중…" : "일기 저장"}
        </button>
      </div>
      {entries.length > 0 && (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className={`border-t pt-3 ${tone.isImmersive ? "border-white/15" : "border-stone-100"}`}>
              <p className={`text-xs ${tone.muted}`}>{entry.dateLabel}</p>
              <p className={`mt-1 whitespace-pre-wrap text-sm ${tone.text}`}>{entry.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentPanel({ item, tone, comments, allComments, onChange: setComments, onBlocked }) {
  const viewer = useViewer();
  const { channel, repos } = useChannel();
  const gate = FeatureGate.check(viewer, Feature.COMMENT);
  const [draft, setDraft] = useState(new CommentDraft());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(""); // 신고·차단 뒤 안내

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await repos.comments.add({ audioId: item.id, userId: viewer.userId, draft });
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setComments([result.comment, ...allComments]);
    setDraft(new CommentDraft());
  }

  async function remove(comment) {
    const result = await repos.comments.remove(comment.id);
    if (result.ok) setComments(allComments.filter((c) => c.id !== comment.id));
  }

  /** 신고한 댓글은 내 화면에서 바로 뺍니다. */
  function reported(comment) {
    setComments(allComments.filter((c) => c.id !== comment.id));
    setNotice("신고했어요. 운영진이 확인한 뒤 처리할게요.");
  }

  function blocked(comment) {
    onBlocked(comment.userId);
    setNotice(`${comment.authorName}님을 차단했어요. 이제 이 분의 댓글이 보이지 않아요. (마이 페이지 > 계정에서 풀 수 있어요)`);
  }

  return (
    <section>
      <div className={`w-full rounded-2xl p-4 text-left ${tone.panel}`}>
        {gate.allowed ? (
          <form onSubmit={submit}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft(draft.withHeart())}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
                  tone.isImmersive ? "border-white/30 text-white hover:bg-white/10" : "border-stone-300 text-rose-500 hover:bg-rose-50"
                }`}
                aria-label="하트 넣기"
              >
                <Heart size={16} strokeWidth={1.5} />
              </button>
              <input
                value={draft.body}
                onChange={(e) => setDraft(CommentDraft.fromInput(e.target.value))}
                placeholder={`댓글 (${CommentDraft.MAX_LENGTH}자까지)`}
                className={`min-w-0 flex-1 rounded-full border px-3.5 py-2 text-sm outline-none ${tone.input}`}
              />
              <button
                type="submit"
                disabled={busy}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-night-700 text-white transition hover:bg-night-800 disabled:opacity-60"
                aria-label="남기기"
              >
                <Send size={15} strokeWidth={1.5} />
              </button>
            </div>
            <p className={`mt-1 text-right text-[11px] ${tone.muted}`}>
              {draft.length}/{CommentDraft.MAX_LENGTH}
            </p>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </form>
        ) : (
          <GatePrompt gate={gate} action="댓글 남기기" tone={tone.isImmersive ? "dark" : "light"} />
        )}

        {notice && (
          <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs ${tone.isImmersive ? "bg-white/15 text-white" : "bg-stone-100 text-stone-600"}`}>
            {notice}
          </p>
        )}

        <ul className="mt-3 space-y-2.5">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              tone={tone}
              canDelete={AccessPolicy.canDeleteComment(viewer, channel, comment)}
              canReport={AccessPolicy.canReportComment(viewer, comment)}
              onRemove={() => remove(comment)}
              onReported={() => reported(comment)}
              onBlocked={() => blocked(comment)}
            />
          ))}
          {comments.length === 0 && <li className={`text-xs ${tone.muted}`}>첫 댓글을 남겨주세요.</li>}
        </ul>
      </div>
    </section>
  );
}

/** 댓글 한 줄 — 남의 댓글에는 ⋯ 메뉴(신고하기·차단하기). */
function CommentItem({ comment, tone, canDelete, canReport, onRemove, onReported, onBlocked }) {
  const [mode, setMode] = useState(null); // null | "menu" | "report" | "block"
  const close = () => setMode(null);
  const menuItem = `flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${tone.isImmersive ? "text-white hover:bg-white/10" : "text-stone-700 hover:bg-stone-50"}`;
  return (
    <li>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-xs ${tone.muted}`}>
            <span className={`font-medium ${tone.text}`}>{comment.authorName}</span> · {comment.relativeTime}
          </p>
          <p className={`mt-0.5 break-words text-sm ${tone.text}`}>
            <CommentBody body={comment.body} isImmersive={tone.isImmersive} />
          </p>
        </div>
        <div className="relative flex shrink-0 items-center">
          {canDelete && (
            <button type="button" onClick={onRemove} className={`p-1 ${tone.muted}`} aria-label="지우기">
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          )}
          {canReport && (
            <button
              type="button"
              onClick={() => setMode(mode === "menu" ? null : "menu")}
              className={`p-1 ${tone.muted}`}
              aria-label="댓글 더 보기"
              aria-expanded={mode === "menu"}
              title="신고·차단"
            >
              <MoreHorizontal size={15} strokeWidth={1.5} />
            </button>
          )}
          {mode === "menu" && (
            <div
              className={`absolute right-0 top-7 z-20 w-36 overflow-hidden rounded-xl shadow-lg ${
                tone.isImmersive ? "bg-stone-900/95 ring-1 ring-white/15" : "bg-white ring-1 ring-stone-200"
              }`}
            >
              <button type="button" className={menuItem} onClick={() => setMode("report")}>
                <Flag size={13} strokeWidth={1.75} /> 신고하기
              </button>
              <button type="button" className={menuItem} onClick={() => setMode("block")}>
                <UserX size={13} strokeWidth={1.75} /> 이 사람 차단하기
              </button>
            </div>
          )}
        </div>
      </div>
      {mode === "report" && <ReportForm comment={comment} tone={tone} onCancel={close} onDone={onReported} />}
      {mode === "block" && <BlockConfirm comment={comment} tone={tone} onCancel={close} onDone={onBlocked} />}
    </li>
  );
}

/** 신고 — 사유 고르기(필수) + 덧붙이는 말(선택). */
function ReportForm({ comment, tone, onCancel, onDone }) {
  const viewer = useViewer();
  const { repos } = useChannel();
  const [draft, setDraft] = useState(() => new ReportDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!draft.isReady || busy) return;
    setBusy(true);
    setError("");
    const result = await repos.reports.report({ commentId: comment.id, reporterId: viewer.userId, draft });
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.reason);
  }

  return (
    <form onSubmit={submit} className={`mt-2 space-y-2 rounded-xl p-3 ${tone.isImmersive ? "bg-white/10" : "bg-stone-50"}`}>
      <p className={`text-xs font-medium ${tone.text}`}>어떤 문제가 있나요?</p>
      <div className="flex flex-wrap gap-1.5">
        {ReportReason.ALL.map((reason) => (
          <button
            key={reason.key}
            type="button"
            onClick={() => setDraft(draft.with({ reason: reason.key }))}
            aria-pressed={draft.reason === reason.key}
            className={`rounded-full px-2.5 py-1 text-xs transition ${tone.chip(draft.reason === reason.key)}`}
          >
            {reason.label}
          </button>
        ))}
      </div>
      <input
        value={draft.detail}
        onChange={(e) => setDraft(draft.with({ detail: e.target.value }))}
        placeholder="덧붙일 말(선택)"
        className={`w-full rounded-lg border px-3 py-1.5 text-xs outline-none ${tone.input}`}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className={`rounded-full px-3 py-1 text-xs ${tone.chip(false)}`}>
          취소
        </button>
        <button
          type="submit"
          disabled={!draft.isReady || busy}
          className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "신고하는 중…" : "신고하기"}
        </button>
      </div>
    </form>
  );
}

/** 차단 확인 — 차단하면 이 사람의 댓글이 내 화면에서 모두 빠집니다. */
function BlockConfirm({ comment, tone, onCancel, onDone }) {
  const viewer = useViewer();
  const { repos } = useChannel();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    const result = await repos.blocks.block(viewer.userId, comment.userId);
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.reason);
  }

  return (
    <div className={`mt-2 space-y-2 rounded-xl p-3 ${tone.isImmersive ? "bg-white/10" : "bg-stone-50"}`}>
      <p className={`text-xs ${tone.text}`}>
        <b className="font-semibold">{comment.authorName}</b>님을 차단할까요? 이 분의 댓글이 모두 보이지 않게 돼요. 마이 페이지 &gt; 계정에서
        언제든 풀 수 있어요.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className={`rounded-full px-3 py-1 text-xs ${tone.chip(false)}`}>
          취소
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="rounded-full bg-stone-800 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "차단하는 중…" : "차단하기"}
        </button>
      </div>
    </div>
  );
}

/** 댓글 본문 — 하트 글자는 가는 선 하트 그림으로. */
function CommentBody({ body, isImmersive }) {
  return CommentText.segments(body).map((part, i) =>
    part.type === "heart" ? (
      <Heart
        key={i}
        size={14}
        strokeWidth={1.5}
        aria-label="하트"
        className={`mx-px inline-block align-[-2px] ${isImmersive ? "text-white" : "text-rose-500"}`}
      />
    ) : (
      <span key={i}>{part.value}</span>
    )
  );
}
