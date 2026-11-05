"use client";

// 로그인·회원가입·비밀번호 화면이 함께 쓰는 틀과 입력칸·소셜 로그인 버튼.

import { useState } from "react";
import { AuthProvider, AuthService } from "@/lib/auth";
import { PLATFORM_TITLE } from "@/lib/mockData";

export function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center py-10">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-700 text-xl font-semibold text-white">
        은
      </span>
      <p className="mt-3 text-xs font-medium text-stone-400">{PLATFORM_TITLE}</p>
      <h1 className="mt-1 text-xl font-semibold text-stone-900">{title}</h1>
      {subtitle && <p className="mt-2 text-center text-sm text-stone-500">{subtitle}</p>}
      <div className="mt-8 w-full">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-stone-500">{footer}</div>}
    </div>
  );
}

export function AuthField({ label, ...inputProps }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>
      <input
        {...inputProps}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
      />
    </label>
  );
}

export function AuthNotice({ tone = "error", children }) {
  if (!children) return null;
  const styles =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <p className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>{children}</p>;
}

export function AuthSubmit({ busy, children }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-xl bg-amber-700 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
    >
      {busy ? "잠시만요…" : children}
    </button>
  );
}

/** 브라우저에서 쓰는 AuthService — 돌아올 주소는 지금 사이트 주소로. */
export function browserAuthService() {
  return new AuthService({ origin: typeof window === "undefined" ? "" : window.location.origin });
}

/** Supabase에서 켠 소셜 로그인 제공자 버튼(없으면 아무것도 그리지 않음). */
export function SocialButtons({ next }) {
  const providers = AuthProvider.enabled();
  const [error, setError] = useState("");
  if (providers.length === 0) return null;

  async function start(provider) {
    setError("");
    const result = await browserAuthService().signInWithProvider(provider, { next });
    if (!result.ok) setError(result.reason);
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-3 text-xs text-stone-400">
        <span className="h-px flex-1 bg-stone-200" /> 또는 <span className="h-px flex-1 bg-stone-200" />
      </div>
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => start(provider)}
          className={`w-full rounded-xl py-2.5 text-sm font-medium transition ${
            provider.id === AuthProvider.KAKAO.id
              ? "bg-[#FEE500] text-stone-900 hover:brightness-95"
              : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
          }`}
        >
          {provider.label}
        </button>
      ))}
      <AuthNotice>{error}</AuthNotice>
    </div>
  );
}
