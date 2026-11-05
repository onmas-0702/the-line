"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard, AuthField, AuthNotice, AuthSubmit, browserAuthService } from "@/components/auth/AuthCard";
import { AuthPaths } from "@/lib/auth";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await browserAuthService().sendPasswordReset(email);
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setSent(true);
  }

  return (
    <AuthCard
      title="비밀번호 찾기"
      subtitle="가입한 이메일로 비밀번호를 다시 정하는 링크를 보내드려요."
      footer={
        <Link href={AuthPaths.LOGIN} className="font-medium text-amber-700 hover:underline">
          로그인으로 돌아가기
        </Link>
      }
    >
      {sent ? (
        <AuthNotice tone="success">{email}로 메일을 보냈어요. 메일의 링크를 눌러 새 비밀번호를 정해 주세요.</AuthNotice>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <AuthField label="이메일" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <AuthNotice>{error}</AuthNotice>
          <AuthSubmit busy={busy}>메일 보내기</AuthSubmit>
        </form>
      )}
    </AuthCard>
  );
}
