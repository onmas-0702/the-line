"use client";

// 계정 — 내 로그인 정보, 차단한 사람(lib/moderation.js), 회원 탈퇴(lib/account.js의 AccountDeletion).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, UserRound, UserX } from "lucide-react";
import { useViewer } from "@/components/ViewerProvider";
import { AccountDeletion } from "@/lib/account";
import { PLATFORM_INFO } from "@/lib/mockData";
import { UserBlockRepository } from "@/lib/moderation";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export default function AccountSection() {
  const viewer = useViewer();
  const [isDeleted, setIsDeleted] = useState(false);

  if (isDeleted) return <DeletedNotice />;

  return (
    <div className="space-y-4">
      <section className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500">
          <UserRound size={20} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-900">{viewer.displayName || "회원"}</p>
          {viewer.email && <p className="truncate text-xs text-stone-500">{viewer.email}</p>}
        </div>
      </section>

      {isSupabaseConfigured && viewer.userId && <BlockedUsersCard userId={viewer.userId} />}

      <DeleteAccountCard onDeleted={() => setIsDeleted(true)} />
    </div>
  );
}

/** 차단한 사람 — 댓글에서 차단한 회원 목록과 차단 풀기. */
function BlockedUsersCard({ userId }) {
  const [repo] = useState(() => new UserBlockRepository());
  const [blocks, setBlocks] = useState(null); // null = 불러오는 중
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    repo.listMine(userId).then((result) => {
      if (cancelled) return;
      setBlocks(result.blocks);
      setError(result.ok ? "" : result.reason);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, userId]);

  async function unblock(target) {
    const result = await repo.unblock(userId, target.userId);
    if (!result.ok) return setError(result.reason);
    setBlocks((list) => list.filter((b) => b.userId !== target.userId));
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-stone-900">
        <UserX size={15} className="text-stone-500" /> 차단한 사람
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">차단한 분의 댓글은 내 화면에 보이지 않아요. 댓글의 ⋯ 메뉴에서 차단할 수 있어요.</p>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      {blocks === null ? (
        <p className="mt-3 text-xs text-stone-400">불러오는 중…</p>
      ) : blocks.length === 0 ? (
        <p className="mt-3 text-xs text-stone-400">차단한 사람이 없어요.</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-100">
          {blocks.map((b) => (
            <li key={b.userId} className="flex items-center justify-between py-2">
              <span className="truncate text-sm text-stone-800">{b.name}</span>
              <button
                type="button"
                onClick={() => unblock(b)}
                className="shrink-0 rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
              >
                차단 풀기
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeleteAccountCard({ onDeleted }) {
  const [isOpen, setIsOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [typed, setTyped] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = AccountDeletion.canSubmit(typed, agreed) && !isSubmitting;

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError("");
    const result = await AccountDeletion.request();
    setIsSubmitting(false);
    if (result.ok) onDeleted();
    else setError(result.message);
  }

  if (!isOpen) {
    return (
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-900">회원 탈퇴</h2>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">탈퇴하면 계정과 기록이 지워지고 되돌릴 수 없어요.</p>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="mt-3 rounded-full border border-stone-300 px-3.5 py-1.5 text-xs font-medium text-stone-600 transition hover:border-rose-300 hover:text-rose-600"
        >
          탈퇴하기
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-500" />
        <div>
          <h2 className="text-sm font-semibold text-stone-900">정말 탈퇴할까요?</h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">탈퇴하면 아래 정보가 바로 지워지고 되돌릴 수 없어요.</p>
        </div>
      </div>

      <ul className="list-disc space-y-1 pl-9 text-xs leading-relaxed text-stone-600">
        {AccountDeletion.REMOVED.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>법령에 따라 보관해야 하는 결제 기록 등은 정해진 기간 동안만 따로 보관해요.</li>
      </ul>

      <label className="flex items-start gap-2 text-xs text-stone-700">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-rose-600" />
        위 내용을 확인했고, 탈퇴하면 되돌릴 수 없다는 것에 동의해요.
      </label>

      <label className="block text-xs text-stone-700">
        확인을 위해 <strong className="text-rose-600">{AccountDeletion.CONFIRM_WORD}</strong>라고 입력해 주세요.
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={AccountDeletion.CONFIRM_WORD}
          className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-white px-3 py-2 text-xs text-rose-600">
          {error}
          {error.includes("문의") && <span className="mt-0.5 block text-stone-500">운영팀: {PLATFORM_INFO.email}</span>}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setAgreed(false);
            setTyped("");
            setError("");
          }}
          className="flex-1 rounded-full border border-stone-300 bg-white py-2 text-sm font-medium text-stone-700"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 rounded-full bg-rose-600 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isSubmitting ? "탈퇴하는 중…" : "탈퇴하기"}
        </button>
      </div>
    </form>
  );
}

function DeletedNotice() {
  const router = useRouter();
  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-6 text-center">
      <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
      <h2 className="text-base font-semibold text-stone-900">탈퇴가 완료됐어요</h2>
      <p className="text-sm leading-relaxed text-stone-500">그동안 함께해 주셔서 감사합니다.</p>
      {/* 로그인 정보가 바뀌었으니 처음 화면으로 가면서 서버 화면도 새로 불러옵니다. */}
      <button
        type="button"
        onClick={() => {
          router.replace("/");
          router.refresh();
        }}
        className="inline-block rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white"
      >
        처음으로
      </button>
    </section>
  );
}
