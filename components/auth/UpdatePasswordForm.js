"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard, AuthField, AuthNotice, AuthSubmit, browserAuthService } from "@/components/auth/AuthCard";
import { PasswordResetForm, PasswordRule } from "@/lib/auth";

export default function UpdatePasswordForm() {
  const router = useRouter();
  const [form, setForm] = useState(new PasswordResetForm());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm(new PasswordResetForm({ ...form, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await browserAuthService().updatePassword(form);
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    router.replace("/mypage");
    router.refresh();
  }

  return (
    <AuthCard title="새 비밀번호" subtitle="앞으로 로그인할 때 쓸 비밀번호를 정해 주세요.">
      <form onSubmit={submit} className="space-y-3">
        <AuthField
          label={`새 비밀번호 (영문·숫자 포함 ${PasswordRule.MIN_LENGTH}자 이상)`}
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update("password")}
        />
        <AuthField
          label="새 비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={form.passwordConfirm}
          onChange={update("passwordConfirm")}
        />
        <AuthNotice>{error}</AuthNotice>
        <AuthSubmit busy={busy}>비밀번호 바꾸기</AuthSubmit>
      </form>
    </AuthCard>
  );
}
