"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard, AuthField, AuthNotice, AuthSubmit, SocialButtons, browserAuthService } from "@/components/auth/AuthCard";
import { AuthPaths, PasswordRule, SignUpForm } from "@/lib/auth";

export default function SignUpFormView({ next }) {
  const router = useRouter();
  const [form, setForm] = useState(new SignUpForm());
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) =>
    setForm(new SignUpForm({ ...form, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await browserAuthService().signUp(form, { next });
    setBusy(false);
    if (!result.ok) {
      setError(result.reason === "not-configured" ? "서버 설정(Supabase)이 아직 안 되어 있어요." : result.reason);
      return;
    }
    if (result.needsEmailConfirm) {
      setSentTo(form.email);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (sentTo) {
    return (
      <AuthCard title="메일을 확인해 주세요" subtitle={`${sentTo}로 인증 메일을 보냈어요. 메일의 링크를 누르면 가입이 끝나요.`}>
        <p className="text-center text-xs text-stone-400">메일이 안 보이면 스팸함도 확인해 주세요.</p>
        <Link
          href={AuthPaths.login(next)}
          className="mt-6 block w-full rounded-xl border border-stone-300 bg-white py-2.5 text-center text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          로그인 화면으로
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="회원가입"
      subtitle="가입은 무료예요. 콘텐츠에 한줄평과 이모지를 남길 수 있어요."
      footer={
        <>
          이미 회원이신가요?{" "}
          <Link href={AuthPaths.login(next)} className="font-medium text-amber-700 hover:underline">
            로그인
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <AuthField label="이름(닉네임)" autoComplete="nickname" value={form.name} onChange={update("name")} maxLength={SignUpForm.NAME_MAX} />
        <AuthField label="이메일" type="email" autoComplete="email" value={form.email} onChange={update("email")} />
        <AuthField
          label={`비밀번호 (영문·숫자 포함 ${PasswordRule.MIN_LENGTH}자 이상)`}
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update("password")}
        />
        <AuthField
          label="비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={form.passwordConfirm}
          onChange={update("passwordConfirm")}
        />
        <label className="flex items-start gap-2 pt-1 text-xs text-stone-600">
          <input type="checkbox" checked={form.agreeTerms} onChange={update("agreeTerms")} className="mt-0.5 accent-amber-700" />
          <span>
            <Link href="/terms" className="underline">이용약관</Link>과{" "}
            <Link href="/privacy" className="underline">개인정보 처리방침</Link>에 동의합니다. (필수)
          </span>
        </label>
        <AuthNotice>{error}</AuthNotice>
        <AuthSubmit busy={busy}>가입하기</AuthSubmit>
      </form>
      <SocialButtons next={next} />
    </AuthCard>
  );
}
