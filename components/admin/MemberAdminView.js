"use client";

// 관리자 페이지 > 회원 관리 — 위쪽 숫자, 검색·필터·정렬, 회원 목록, 누르면 오른쪽(휴대폰은 아래)에 상세와 정지·해제.
// 계산은 lib/memberAdmin.js(MemberQuery·MemberStats·MemberRecord), 조회·정지는 서버(/api/admin/members).

import { useEffect, useState } from "react";
import { Ban, ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { MemberAdminApi, MemberFilter, MemberQuery, MemberRecord, MemberSort, MemberStats, SuspendDraft } from "@/lib/memberAdmin";

export default function MemberAdminView() {
  const [members, setMembers] = useState(null); // null = 불러오는 중
  const [error, setError] = useState("");
  const [query, setQuery] = useState(() => new MemberQuery());
  const [selectedId, setSelectedId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    MemberAdminApi.list().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setMembers(result.members);
        setError("");
      } else {
        setMembers((list) => list || []);
        setError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const list = members || [];
  const stats = new MemberStats(list);
  const counts = MemberQuery.countBy(list);
  const view = query.apply(list);
  const selected = list.find((m) => m.id === selectedId) || null;

  function replaceMember(next) {
    if (next) setMembers((all) => all.map((m) => (m.id === next.id ? next : m)));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">회원 관리</h1>
          <p className="mt-0.5 text-xs text-stone-500">가입한 모든 회원을 보고, 문제가 있는 회원은 이용을 정지할 수 있어요.</p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
        >
          <RefreshCw size={12} /> 새로고침
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="전체 회원" value={stats.total} />
        <StatCard label="구독자" value={stats.subscribers} />
        <StatCard label="이번 달 가입" value={stats.joinedThisMonth} />
        <StatCard label="최근 7일 접속" value={stats.activeThisWeek} />
        <StatCard label="정지" value={stats.suspended} tone={stats.suspended ? "rose" : "stone"} />
      </div>

      <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-stone-300 px-3 py-1.5 focus-within:border-night-600">
            <Search size={14} className="shrink-0 text-stone-400" />
            <input
              value={query.text}
              onChange={(e) => setQuery(query.with({ text: e.target.value }))}
              placeholder="이름이나 이메일로 찾기"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={query.sort}
            onChange={(e) => setQuery(query.with({ sort: e.target.value }))}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-700"
            aria-label="정렬"
          >
            {MemberSort.ALL.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MemberFilter.ALL.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setQuery(query.with({ filter: f.key }))}
              aria-pressed={query.filter === f.key}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                query.filter === f.key ? "bg-night-700 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {members === null ? (
            <p className="py-16 text-center text-sm text-stone-400">회원 목록을 불러오는 중…</p>
          ) : view.rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-stone-400">조건에 맞는 회원이 없어요.</p>
          ) : (
            <>
              <div className="hidden grid-cols-[1.6fr_0.7fr_1fr_0.8fr_0.8fr] gap-2 border-b border-stone-100 px-4 py-2 text-[11px] font-medium text-stone-400 sm:grid">
                <span>회원</span>
                <span>구분</span>
                <span>구독</span>
                <span>가입일</span>
                <span>마지막 접속</span>
              </div>
              <ul className="divide-y divide-stone-100">
                {view.rows.map((m) => (
                  <MemberRow key={m.id} member={m} isSelected={m.id === selectedId} onSelect={() => setSelectedId(m.id === selectedId ? null : m.id)} />
                ))}
              </ul>
              <Pager view={view} onPage={(page) => setQuery(query.with({ page }))} />
            </>
          )}
        </section>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          {selected ? (
            <MemberDetail key={selected.id} member={selected} onClose={() => setSelectedId(null)} onChanged={replaceMember} />
          ) : (
            <p className="hidden rounded-2xl border border-dashed border-stone-200 px-4 py-12 text-center text-xs text-stone-400 lg:block">
              회원을 누르면 자세한 정보와 정지 메뉴가 여기에 나와요.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = "stone" }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tone === "rose" ? "text-rose-600" : "text-stone-900"}`}>{value.toLocaleString("ko-KR")}</p>
    </div>
  );
}

const TIER_STYLE = {
  정지: "bg-rose-50 text-rose-600",
  운영진: "bg-night-50 text-night-700",
  구독자: "bg-amber-50 text-amber-700",
  회원: "bg-stone-100 text-stone-600",
};

function TierBadge({ member }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${TIER_STYLE[member.tierLabel]}`}>{member.tierLabel}</span>;
}

function MemberRow({ member, isSelected, onSelect }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`grid w-full grid-cols-[1fr_auto] items-center gap-2 px-4 py-2.5 text-left transition sm:grid-cols-[1.6fr_0.7fr_1fr_0.8fr_0.8fr] ${
          isSelected ? "bg-night-50/60" : "hover:bg-stone-50"
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-stone-900">
            {member.displayName}
            {member.reportedCount > 0 && <span className="ml-1.5 text-[11px] font-normal text-rose-500">신고 {member.reportedCount}</span>}
          </span>
          <span className="block truncate text-xs text-stone-500">{member.email}</span>
        </span>
        <span>
          <TierBadge member={member} />
        </span>
        <span className="hidden text-xs text-stone-600 sm:block">{member.subscriptionLabel}</span>
        <span className="hidden text-xs tabular-nums text-stone-600 sm:block">{MemberRecord.date(member.joinedAt)}</span>
        <span className="hidden text-xs text-stone-600 sm:block">{MemberRecord.ago(member.lastSignInAt)}</span>
      </button>
    </li>
  );
}

function Pager({ view, onPage }) {
  if (view.pageCount <= 1) return <p className="border-t border-stone-100 px-4 py-2 text-[11px] text-stone-400">{view.total}명</p>;
  return (
    <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2 text-xs text-stone-500">
      <span>
        {view.total}명 · {view.page}/{view.pageCount}쪽
      </span>
      <span className="flex gap-1">
        <button type="button" disabled={view.page <= 1} onClick={() => onPage(view.page - 1)} className="rounded-full p-1 hover:bg-stone-100 disabled:opacity-30" aria-label="이전 쪽">
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          disabled={view.page >= view.pageCount}
          onClick={() => onPage(view.page + 1)}
          className="rounded-full p-1 hover:bg-stone-100 disabled:opacity-30"
          aria-label="다음 쪽"
        >
          <ChevronRight size={16} />
        </button>
      </span>
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-xs">
      <dt className="shrink-0 text-stone-500">{label}</dt>
      <dd className="min-w-0 text-right text-stone-800">{children}</dd>
    </div>
  );
}

function MemberDetail({ member, onClose, onChanged }) {
  const [isSuspending, setIsSuspending] = useState(false);
  const [draft, setDraft] = useState(() => new SuspendDraft());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function suspend(e) {
    e.preventDefault();
    if (!draft.isReady || busy) return;
    setBusy(true);
    setMessage("");
    const result = await MemberAdminApi.suspend(member.id, draft);
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    onChanged(result.member);
    setIsSuspending(false);
    setMessage(result.note || "정지했어요. 이 회원은 이제 로그인할 수 없어요.");
  }

  async function unsuspend() {
    setBusy(true);
    setMessage("");
    const result = await MemberAdminApi.unsuspend(member.id);
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    onChanged(result.member);
    setMessage("정지를 풀었어요. 다시 로그인할 수 있어요.");
  }

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
          <UserRound size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-stone-900">{member.displayName}</p>
          <p className="truncate text-xs text-stone-500">{member.email}</p>
          <div className="mt-1">
            <TierBadge member={member} />
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-stone-400 hover:bg-stone-100" aria-label="닫기">
          <X size={16} />
        </button>
      </div>

      <dl className="divide-y divide-stone-100 border-y border-stone-100">
        <InfoRow label="로그인 방법">{member.providerLabel}</InfoRow>
        <InfoRow label="가입일">{MemberRecord.date(member.joinedAt)}</InfoRow>
        <InfoRow label="마지막 접속">{MemberRecord.ago(member.lastSignInAt)}</InfoRow>
        <InfoRow label="구독">{member.subscriptionLabel}</InfoRow>
        {member.subscription && (
          <>
            <InfoRow label="구독 시작일">{MemberRecord.date(member.subscription.startedAt)}</InfoRow>
            <InfoRow label="최근 결제일">{MemberRecord.date(member.subscription.lastPaidAt)}</InfoRow>
            {member.nextBillingAt && <InfoRow label="다음 결제일">{MemberRecord.date(member.nextBillingAt)}</InfoRow>}
            {member.endsAt && <InfoRow label="이용 종료일">{MemberRecord.date(member.endsAt)}</InfoRow>}
            {member.subscription.cardLabel && <InfoRow label="결제 카드">{member.subscription.cardLabel}</InfoRow>}
          </>
        )}
        {member.isStaff && (
          <InfoRow label="운영">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={12} className="text-night-600" /> {member.roleLabel}
            </span>
          </InfoRow>
        )}
        <InfoRow label="남긴 댓글">{member.commentCount}개</InfoRow>
        <InfoRow label="처리 안 된 신고">
          <span className={member.reportedCount ? "font-semibold text-rose-600" : ""}>{member.reportedCount}건</span>
        </InfoRow>
      </dl>

      <MemberPayments member={member} onChanged={onChanged} />

      {member.isSuspended && (
        <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <p className="font-semibold">이용 정지 중 {member.suspendedAt && `· ${MemberRecord.date(member.suspendedAt)}부터`}</p>
          {member.suspendReason && <p className="mt-0.5">사유: {member.suspendReason}</p>}
        </div>
      )}

      {message && (
        <p role="status" className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-700">
          {message}
        </p>
      )}

      {member.isSuspended ? (
        <button
          type="button"
          onClick={unsuspend}
          disabled={busy}
          className="w-full rounded-full border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {busy ? "푸는 중…" : "정지 풀기"}
        </button>
      ) : isSuspending ? (
        <form onSubmit={suspend} className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
          <p className="text-xs font-semibold text-stone-900">이 회원의 이용을 정지할까요?</p>
          <p className="text-[11px] leading-relaxed text-stone-600">정지하면 로그인할 수 없고, 이미 열려 있는 화면도 길어야 1시간 안에 로그아웃돼요. 언제든 풀 수 있어요.</p>
          <textarea
            value={draft.reason}
            onChange={(e) => setDraft(draft.with({ reason: e.target.value }))}
            rows={2}
            placeholder="정지 사유(관리자만 봐요)"
            className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs outline-none focus:border-rose-400"
          />
          <label className="flex items-center gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={draft.hideComments} onChange={(e) => setDraft(draft.with({ hideComments: e.target.checked }))} className="accent-rose-600" />
            이 회원이 남긴 댓글도 모두 숨기기
          </label>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setIsSuspending(false)} className="flex-1 rounded-full border border-stone-300 bg-white py-1.5 text-xs text-stone-600">
              취소
            </button>
            <button type="submit" disabled={!draft.isReady || busy} className="flex-1 rounded-full bg-rose-600 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? "정지하는 중…" : "정지하기"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsSuspending(true)}
          disabled={member.roles.some((r) => r.role === "owner")}
          title={member.roles.some((r) => r.role === "owner") ? "채널 소유자는 정지할 수 없어요" : undefined}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-rose-300 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300"
        >
          <Ban size={14} /> 이용 정지
        </button>
      )}
    </section>
  );
}

/** 결제 내역 + 환불(전액·부분). 환불하면 그 회원의 멤버십은 바로 끝납니다. */
function MemberPayments({ member }) {
  const [payments, setPayments] = useState(null);
  const [refunding, setRefunding] = useState(null); // 환불 입력 중인 결제 id
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    MemberAdminApi.payments(member.id).then((result) => {
      if (!cancelled) setPayments(result.ok ? result.payments : []);
    });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  async function refund(payment) {
    setBusy(true);
    setMessage("");
    const result = await MemberAdminApi.refund(payment.id, { amount: amount ? Number(amount) : undefined, reason: reason.trim() || "관리자 환불" });
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    setRefunding(null);
    setMessage("환불했어요. 이 회원의 멤버십은 끝났어요. 새로고침하면 상태가 바뀌어 보여요.");
    const reloaded = await MemberAdminApi.payments(member.id);
    if (reloaded.ok) setPayments(reloaded.payments);
  }

  if (payments === null) return <p className="text-xs text-stone-400">결제 내역을 불러오는 중…</p>;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-stone-700">결제 내역</p>
      {payments.length === 0 ? (
        <p className="text-xs text-stone-400">결제 내역이 없어요.</p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-100">
          {payments.map((p) => (
            <li key={p.id} className="px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-stone-700">
                  {MemberRecord.date(p.paidAt || p.createdAt)} · {p.kindLabel}
                </span>
                <span className="tabular-nums font-medium text-stone-900">{p.amountLabel}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className={p.status === "paid" ? "text-emerald-600" : p.status === "failed" ? "text-rose-500" : "text-stone-500"}>
                  {p.statusLabel}
                  {p.refundedAmount > 0 && ` ${p.refundedAmount.toLocaleString("ko-KR")}원`}
                  {p.message && p.status !== "paid" && ` · ${p.message}`}
                </span>
                {p.canRefund && refunding !== p.id && (
                  <button type="button" onClick={() => { setRefunding(p.id); setAmount(""); setReason(""); }} className="text-rose-600 hover:underline">
                    환불
                  </button>
                )}
              </div>
              {refunding === p.id && (
                <div className="mt-2 space-y-1.5 rounded-lg bg-rose-50/60 p-2">
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    placeholder={`환불 금액(비우면 전액 ${p.amount.toLocaleString("ko-KR")}원)`}
                    className="w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-xs outline-none"
                  />
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="환불 사유"
                    className="w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-xs outline-none"
                  />
                  <p className="text-[11px] text-rose-700">환불하면 카드 결제가 취소되고 이 회원의 멤버십은 바로 끝나요.</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setRefunding(null)} className="flex-1 rounded-full border border-stone-300 bg-white py-1">
                      취소
                    </button>
                    <button type="button" disabled={busy} onClick={() => refund(p)} className="flex-1 rounded-full bg-rose-600 py-1 font-semibold text-white disabled:opacity-50">
                      {busy ? "환불 중…" : "환불하기"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {message && <p className="mt-1.5 text-xs text-stone-600">{message}</p>}
    </div>
  );
}
