"use client";

// 로그인·회원가입·비밀번호 화면이 함께 쓰는 틀과 입력칸·소셜 로그인 버튼.

import { useState } from "react";
import { AuthProvider, AuthService } from "@/lib/auth";
import { PLATFORM_TITLE } from "@/lib/mockData";

/** 제공자 공식 로고 — 구글은 4색 G 마크(구글 브랜드 가이드 그대로). */
const PROVIDER_LOGOS = {
  google: () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  ),
};

function ProviderLogo({ provider }) {
  const Logo = PROVIDER_LOGOS[provider.id];
  return Logo ? <Logo /> : null;
}

export function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center py-10">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-night-700 text-xl font-semibold text-white">
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
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition focus:border-night-600 focus:ring-2 focus:ring-night-100"
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
      className="w-full rounded-xl bg-night-700 py-2.5 text-sm font-semibold text-white transition hover:bg-night-800 disabled:opacity-60"
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
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition ${
            provider.id === AuthProvider.KAKAO.id
              ? "bg-[#FEE500] text-stone-900 hover:brightness-95"
              : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
          }`}
        >
          <ProviderLogo provider={provider} />
          {provider.label}
        </button>
      ))}
      <AuthNotice>{error}</AuthNotice>
    </div>
  );
}
