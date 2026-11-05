"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard, AuthField, AuthNotice, AuthSubmit, SocialButtons, browserAuthService } from "@/components/auth/AuthCard";
import { AuthPaths, SignInForm } from "@/lib/auth";

export default function LoginForm({ next, initialError = "", notice = "" }) {
  const router = useRouter();
  const [form, setForm] = useState(new SignInForm());
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm(new SignInForm({ ...form, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await browserAuthService().signIn(form);
    if (!result.ok) {
      setError(result.reason === "not-configured" ? "서버 설정(Supabase)이 아직 안 되어 있어요." : result.reason);
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <AuthCard
      title="로그인"
      subtitle="로그인하면 댓글을 남기고, 구독하면 마이 페이지를 쓸 수 있어요."
      footer={
        <>
          아직 회원이 아니신가요?{" "}
          <Link href={AuthPaths.signup(next)} className="font-medium text-amber-700 hover:underline">
            회원가입
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <AuthNotice tone="success">{notice}</AuthNotice>
        <AuthField label="이메일" type="email" autoComplete="email" value={form.email} onChange={update("email")} />
        <AuthField
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={update("password")}
        />
        <AuthNotice>{error}</AuthNotice>
        <AuthSubmit busy={busy}>로그인</AuthSubmit>
        <p className="text-right text-xs">
          <Link href={AuthPaths.FORGOT_PASSWORD} className="text-stone-500 hover:underline">
            비밀번호를 잊으셨나요?
          </Link>
        </p>
      </form>
      <SocialButtons next={next} />
    </AuthCard>
  );
}
