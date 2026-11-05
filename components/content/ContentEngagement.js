"use client";

// 콘텐츠 화면 아래쪽 — 좋아요·담아두기·감상일기 버튼과 댓글(이모지) 댓글.
// 누가 무엇을 할 수 있는지는 FeatureGate/AccessPolicy(lib/access.js)가 정하고,
// 저장은 채널 저장소(useChannel().repos)가 합니다.

import { useEffect, useState } from "react";
import { Bookmark, ChevronDown, Heart, MessageCircle, NotebookPen, Send, Trash2 } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import GatePrompt from "@/components/common/GatePrompt";
import { useViewer } from "@/components/ViewerProvider";
import { AccessPolicy, FeatureGate } from "@/lib/access";
import { AudioMarkKind, AudioMarks, CommentDraft, CommentText, JournalDraft } from "@/lib/engagement";
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
  chip(active) {
    if (this.isImmersive) return active ? "bg-white/35 text-white" : "bg-white/15 text-white hover:bg-white/25";
    return active ? "bg-amber-700 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200";
  }
}

export default function ContentEngagement({ item, isImmersive }) {
  const tone = new Tone(isImmersive);
  const [journalOpen, setJournalOpen] = useState(false);
  if (!isSupabaseConfigured) return null;

  return (
    <div className="space-y-4 px-2 pb-4">
      <MarkButtons item={item} tone={tone} journalOpen={journalOpen} onToggleJournal={() => setJournalOpen((v) => !v)} />
      {journalOpen && <JournalPanel item={item} tone={tone} />}
      <CommentSection item={item} tone={tone} />
    </div>
  );
}

function MarkButtons({ item, tone, journalOpen, onToggleJournal }) {
  const viewer = useViewer();
  const { repos } = useChannel();
  const [marks, setMarks] = useState(new AudioMarks());
  const [error, setError] = useState("");
  const likeGate = FeatureGate.check(viewer, Feature.LIKE);
  const saveGate = FeatureGate.check(viewer, Feature.SAVE);
  const journalGate = FeatureGate.check(viewer, Feature.JOURNAL);

  useEffect(() => {
    let cancelled = false;
    repos.marks.stateFor(item.id, viewer.userId).then((result) => {
      if (!cancelled) setMarks(result.marks);
    });
    return () => {
      cancelled = true;
    };
  }, [repos, item.id, viewer.userId]);

  async function toggle(kind) {
    const next = marks.toggled(kind);
    setMarks(next); // 먼저 화면에 반영하고, 실패하면 되돌립니다
    setError("");
    const result = await repos.marks.set({ audioId: item.id, userId: viewer.userId, kind, on: next.has(kind) });
    if (!result.ok) {
      setMarks(marks);
      setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  const buttons = [
    { kind: AudioMarkKind.LIKE, gate: likeGate, icon: Heart, label: `좋아요${marks.likeCount ? ` ${marks.likeCount}` : ""}`, active: marks.liked },
    { kind: AudioMarkKind.SAVE, gate: saveGate, icon: Bookmark, label: "담아두기", active: marks.saved },
  ];

  const firstBlocked = [likeGate, saveGate, journalGate].find((g) => !g.allowed);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {buttons.map(({ kind, gate, icon: Icon, label, active }) => (
          <button
            key={kind}
            type="button"
            disabled={!gate.allowed}
            onClick={() => toggle(kind)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition disabled:opacity-50 ${tone.chip(active)}`}
          >
            <Icon size={15} fill={active ? "currentColor" : "none"} /> {label}
          </button>
        ))}
        <button
          type="button"
          disabled={!journalGate.allowed}
          onClick={onToggleJournal}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition disabled:opacity-50 ${tone.chip(journalOpen)}`}
        >
          <NotebookPen size={15} /> 감상일기
        </button>
      </div>
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
          className="rounded-full bg-amber-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-60"
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

function CommentSection({ item, tone }) {
  const viewer = useViewer();
  const { channel, repos } = useChannel();
  const gate = FeatureGate.check(viewer, Feature.COMMENT);
  const [open, setOpen] = useState(false); // 펼침식 — 평소엔 작은 '댓글' 버튼만
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState(new CommentDraft());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    repos.comments.listFor(item.id).then((result) => {
      if (!cancelled) setComments(result.comments);
    });
    return () => {
      cancelled = true;
    };
  }, [repos, item.id]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await repos.comments.add({ audioId: item.id, userId: viewer.userId, draft });
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setComments((prev) => [result.comment, ...prev]);
    setDraft(new CommentDraft());
  }

  async function remove(comment) {
    const result = await repos.comments.remove(comment.id);
    if (result.ok) setComments((prev) => prev.filter((c) => c.id !== comment.id));
  }

  return (
    <section className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium tracking-tight transition ${
          tone.isImmersive ? "border-white/40 text-white hover:bg-white/10" : "border-stone-300 text-stone-600 hover:border-stone-400"
        }`}
      >
        <MessageCircle size={15} strokeWidth={1.5} aria-hidden />
        댓글{comments.length > 0 && <span className={tone.muted}>{comments.length}</span>}
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`mt-3 w-full rounded-2xl p-4 text-left ${tone.panel}`}>
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-700 text-white transition hover:bg-amber-800 disabled:opacity-60"
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

          <ul className="mt-3 space-y-2.5">
            {comments.map((comment) => (
              <li key={comment.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs ${tone.muted}`}>
                    <span className={`font-medium ${tone.text}`}>{comment.authorName}</span> · {comment.relativeTime}
                  </p>
                  <p className={`mt-0.5 break-words text-sm ${tone.text}`}>
                    <CommentBody body={comment.body} isImmersive={tone.isImmersive} />
                  </p>
                </div>
                {AccessPolicy.canDeleteComment(viewer, channel, comment) && (
                  <button type="button" onClick={() => remove(comment)} className={`shrink-0 p-1 ${tone.muted}`} aria-label="지우기">
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                )}
              </li>
            ))}
            {comments.length === 0 && <li className={`text-xs ${tone.muted}`}>첫 댓글을 남겨주세요.</li>}
          </ul>
        </div>
      )}
    </section>
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
