"use client";

// 스튜디오 → 운영자 탭(소유자 전용). 가입한 회원을 이메일로 찾아 공동 운영자로 지정하고,
// 맡길 기능(StudioPermission)을 고릅니다. 이미 지정한 운영자의 기능을 바꾸거나 해제할 수 있어요.

import { useEffect, useMemo, useState } from "react";
import { Check, UserMinus } from "lucide-react";
import { useChannel } from "@/components/ChannelProvider";
import { useViewer } from "@/components/ViewerProvider";
import { ChannelStaffRepository, StaffInvite, StaffRole, StudioPermission } from "@/lib/staff";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export default function StaffPanel() {
  const { channel } = useChannel();
  const viewer = useViewer();
  const repo = useMemo(() => new ChannelStaffRepository({ channelId: channel.id }), [channel.id]);
  const [staff, setStaff] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [invite, setInvite] = useState(new StaffInvite());
  const [message, setMessage] = useState({ tone: "", text: "" });
  const [busy, setBusy] = useState(false);

  async function reload() {
    const result = await repo.list();
    setStaff(result.staff);
    setLoadError(result.ok ? "" : result.reason);
  }

  useEffect(() => {
    let cancelled = false;
    repo.list().then((result) => {
      if (cancelled) return;
      setStaff(result.staff);
      setLoadError(result.ok ? "" : result.reason);
    });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  if (!isSupabaseConfigured) {
    return <p className="text-sm text-stone-500">서버(Supabase)를 연결하면 운영자를 지정할 수 있어요.</p>;
  }
  async function assign(e) {
    e.preventDefault();
    setBusy(true);
    setMessage({ tone: "", text: "" });
    const result = await repo.assign(invite);
    setBusy(false);
    if (!result.ok) return setMessage({ tone: "error", text: result.reason });
    setMessage({ tone: "ok", text: `${invite.email.trim()} 님을 운영자로 지정했어요. 다음에 로그인하면 스튜디오가 보여요.` });
    setInvite(new StaffInvite());
    reload();
  }

  return (
    <div className="space-y-8">
      {viewer.isPreviewAdmin && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          임시 관리자 모드예요. 운영자 지정은 실제 소유자 계정으로 로그인해야 저장돼요.
        </p>
      )}
      <section>
        <h2 className="text-base font-semibold text-stone-900">운영자 지정</h2>
        <p className="mt-1 text-sm text-stone-500">
          함께 운영할 분의 이메일을 적고 맡길 기능을 골라주세요. 그분이 먼저 회원가입을 해 두어야 해요.
        </p>
        <form onSubmit={assign} className="mt-3 space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
          <input
            type="email"
            value={invite.email}
            onChange={(e) => setInvite(invite.with({ email: e.target.value }))}
            placeholder="운영자로 지정할 회원의 이메일"
            className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-600"
          />
          <PermissionPicker selected={invite.permissions} onToggle={(key) => setInvite(invite.toggled(key))} />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-amber-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-60"
            >
              {busy ? "지정하는 중…" : "운영자로 지정"}
            </button>
          </div>
          {message.text && (
            <p className={`text-xs ${message.tone === "error" ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p>
          )}
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900">운영자 목록</h2>
        {loadError ? (
          <p className="mt-2 text-sm text-stone-500">
            목록을 불러오지 못했어요. Supabase에 0018 마이그레이션이 적용됐는지 확인해 주세요. ({loadError})
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {staff.map((member) => (
              <StaffRow key={member.userId} member={member} repo={repo} onChanged={reload} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PermissionPicker({ selected, onToggle, disabled = false }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {StudioPermission.ALL.map((permission) => {
        const on = selected.includes(permission.key);
        return (
          <button
            key={permission.key}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(permission.key)}
            aria-pressed={on}
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-left transition disabled:cursor-default ${
              on ? "border-amber-600 bg-amber-50" : "border-stone-200 bg-white hover:bg-stone-50"
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                on ? "border-amber-700 bg-amber-700 text-white" : "border-stone-300"
              }`}
            >
              {on && <Check size={11} strokeWidth={3} />}
            </span>
            <span>
              <span className="block text-sm font-medium text-stone-800">{permission.label}</span>
              <span className="block text-xs text-stone-500">{permission.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StaffRow({ member, repo, onChanged }) {
  const [draft, setDraft] = useState(member);
  const [message, setMessage] = useState("");
  const changed = draft.permissions.join(",") !== member.permissions.join(",");

  async function save() {
    if (draft.permissions.length === 0) return setMessage("기능을 하나 이상 골라주세요. 모두 빼려면 '해제'를 눌러주세요.");
    const result = await repo.updatePermissions(draft);
    setMessage(result.ok ? "저장했어요." : result.reason);
    if (result.ok) onChanged();
  }

  async function remove() {
    if (!window.confirm(`${member.displayName || member.email} 님을 운영자에서 해제할까요?`)) return;
    const result = await repo.remove(member);
    if (!result.ok) return setMessage(result.reason);
    onChanged();
  }

  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-800">
            {member.displayName || "이름 없음"}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                member.isOwner ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"
              }`}
            >
              {StaffRole.label(member.role)}
            </span>
          </p>
          <p className="truncate text-xs text-stone-400">{member.email}</p>
        </div>
        {!member.isOwner && (
          <button type="button" onClick={remove} className="flex shrink-0 items-center gap-1 text-xs text-stone-400 hover:text-red-600">
            <UserMinus size={13} /> 해제
          </button>
        )}
      </div>
      {member.isOwner ? (
        <p className="mt-2 text-xs text-stone-500">모든 기능과 운영자 관리를 할 수 있어요.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <PermissionPicker selected={draft.permissions} onToggle={(key) => setDraft(draft.toggled(key))} />
          {(changed || message) && (
            <div className="flex items-center justify-end gap-3">
              {message && <span className="text-xs text-stone-500">{message}</span>}
              {changed && (
                <button
                  type="button"
                  onClick={save}
                  className="rounded-full bg-amber-700 px-3.5 py-1 text-xs font-medium text-white hover:bg-amber-800"
                >
                  변경 저장
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
