// 회원가입·로그인(Supabase Auth). 서버·클라이언트 양쪽에서 쓰므로 "use client"를
// 붙이지 않고, next/* 모듈도 가져오지 않습니다(서버 전용은 lib/supabaseServer.js).
//
//   AuthProvider   — 소셜 로그인 제공자(Google·카카오) 목록과 "켜졌는지"
//   SafeRedirect   — 로그인 뒤 돌아갈 주소(?next=)를 우리 사이트 안으로만 제한
//   AuthPaths      — 로그인 관련 주소를 한 곳에서 만듭니다
//   AuthMessages   — Supabase 오류를 한국어 안내로
//   SignInForm / SignUpForm / PasswordResetForm — 입력값 검사(불변, 결과는 오류 문구 또는 null)
//   AuthService    — 실제 로그인·가입·로그아웃 호출({ ok, reason } 결과 객체)

import { SupabaseRepository } from "@/lib/supabaseRepository";

export class AuthProvider {
  static GOOGLE = Object.freeze({ id: "google", label: "Google로 계속하기" });
  static KAKAO = Object.freeze({ id: "kakao", label: "카카오로 계속하기" });
  static ALL = [AuthProvider.GOOGLE, AuthProvider.KAKAO];

  /** Supabase 대시보드에서 켠 제공자만 버튼으로 보여줍니다(켜지 않은 제공자를 누르면
   *  Supabase 오류 화면이 나오기 때문). 예: NEXT_PUBLIC_AUTH_PROVIDERS=google,kakao */
  static enabled(raw = process.env.NEXT_PUBLIC_AUTH_PROVIDERS) {
    const ids = new Set(String(raw || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
    return AuthProvider.ALL.filter((p) => ids.has(p.id));
  }
}

export class SafeRedirect {
  static DEFAULT = "/";

  /** 같은 사이트 안의 경로(/로 시작, //나 /\ 아님)만 허용합니다 — 다른 사이트로 튕겨 보내는
   *  "열린 리디렉션"을 막습니다. */
  static path(raw, fallback = SafeRedirect.DEFAULT) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string" || !value.startsWith("/")) return fallback;
    if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
    if (/[\r\n]/.test(value)) return fallback;
    return value;
  }
}

export class AuthPaths {
  static LOGIN = "/login";
  static SIGNUP = "/signup";
  static LOGOUT = "/logout";
  static CALLBACK = "/auth/callback";
  static FORGOT_PASSWORD = "/auth/forgot-password";
  static UPDATE_PASSWORD = "/auth/update-password";

  static #withNext(base, next) {
    const safe = SafeRedirect.path(next, "");
    return safe && safe !== SafeRedirect.DEFAULT ? `${base}?next=${encodeURIComponent(safe)}` : base;
  }

  static login(next) {
    return AuthPaths.#withNext(AuthPaths.LOGIN, next);
  }

  static signup(next) {
    return AuthPaths.#withNext(AuthPaths.SIGNUP, next);
  }

  /** 이메일 인증·소셜 로그인·비밀번호 재설정 후 돌아올 전체 주소. */
  static callbackUrl(origin, next) {
    return `${origin}${AuthPaths.#withNext(AuthPaths.CALLBACK, next)}`;
  }
}

export class AuthMessages {
  static #BY_CODE = {
    invalid_credentials: "이메일 또는 비밀번호가 맞지 않아요.",
    email_not_confirmed: "이메일 인증이 아직 안 됐어요. 메일함에서 인증 링크를 눌러주세요.",
    user_already_exists: "이미 가입된 이메일이에요. 로그인해 주세요.",
    email_exists: "이미 가입된 이메일이에요. 로그인해 주세요.",
    weak_password: "비밀번호가 너무 쉬워요. 다른 비밀번호를 써주세요.",
    over_email_send_rate_limit: "메일을 너무 자주 보냈어요. 잠시 뒤에 다시 시도해 주세요.",
    over_request_rate_limit: "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.",
    same_password: "지금 쓰는 비밀번호와 달라야 해요.",
    signup_disabled: "지금은 회원가입을 받지 않고 있어요.",
    validation_failed: "입력한 내용을 다시 확인해 주세요.",
  };

  static translate(error) {
    if (!error) return "";
    if (typeof error === "string") return AuthMessages.#BY_CODE[error] || error;
    if (error.code && AuthMessages.#BY_CODE[error.code]) return AuthMessages.#BY_CODE[error.code];
    const message = String(error.message || "");
    if (/invalid login credentials/i.test(message)) return AuthMessages.#BY_CODE.invalid_credentials;
    if (/email not confirmed/i.test(message)) return AuthMessages.#BY_CODE.email_not_confirmed;
    if (/already registered/i.test(message)) return AuthMessages.#BY_CODE.user_already_exists;
    if (/provider is not enabled/i.test(message)) return "이 로그인 방식은 아직 준비 중이에요.";
    return message || "잠시 후 다시 시도해 주세요.";
  }
}

class EmailRule {
  static #PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  static check(email) {
    if (!email) return "이메일을 입력해 주세요.";
    if (!EmailRule.#PATTERN.test(email)) return "이메일 형식을 확인해 주세요.";
    return null;
  }
}

export class PasswordRule {
  static MIN_LENGTH = 8;

  static check(password) {
    if (!password) return "비밀번호를 입력해 주세요.";
    if (password.length < PasswordRule.MIN_LENGTH) return `비밀번호는 ${PasswordRule.MIN_LENGTH}자 이상이어야 해요.`;
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "비밀번호에 영문과 숫자를 함께 넣어주세요.";
    return null;
  }
}

export class SignInForm {
  constructor({ email = "", password = "" } = {}) {
    this.email = String(email).trim();
    this.password = String(password);
    Object.freeze(this);
  }

  validate() {
    return EmailRule.check(this.email) || (this.password ? null : "비밀번호를 입력해 주세요.");
  }
}

export class SignUpForm {
  static NAME_MAX = 20;

  constructor({ name = "", email = "", password = "", passwordConfirm = "", agreeTerms = false } = {}) {
    this.name = String(name).trim();
    this.email = String(email).trim();
    this.password = String(password);
    this.passwordConfirm = String(passwordConfirm);
    this.agreeTerms = Boolean(agreeTerms);
    Object.freeze(this);
  }

  validate() {
    if (!this.name) return "이름(닉네임)을 입력해 주세요.";
    if (this.name.length > SignUpForm.NAME_MAX) return `이름은 ${SignUpForm.NAME_MAX}자 이내로 써주세요.`;
    const emailError = EmailRule.check(this.email);
    if (emailError) return emailError;
    const passwordError = PasswordRule.check(this.password);
    if (passwordError) return passwordError;
    if (this.password !== this.passwordConfirm) return "비밀번호 확인이 일치하지 않아요.";
    if (!this.agreeTerms) return "이용약관과 개인정보 처리방침에 동의해 주세요.";
    return null;
  }
}

export class PasswordResetForm {
  constructor({ password = "", passwordConfirm = "" } = {}) {
    this.password = String(password);
    this.passwordConfirm = String(passwordConfirm);
    Object.freeze(this);
  }

  validate() {
    const passwordError = PasswordRule.check(this.password);
    if (passwordError) return passwordError;
    if (this.password !== this.passwordConfirm) return "비밀번호 확인이 일치하지 않아요.";
    return null;
  }
}

/** 로그인·가입·로그아웃. 브라우저에서는 기본 클라이언트(쿠키 세션)를, 서버 라우트에서는
 *  ServerSupabase.create()로 만든 클라이언트를 넘겨서 씁니다. */
export class AuthService extends SupabaseRepository {
  /** origin: 이메일 인증·소셜 로그인 후 돌아올 사이트 주소(예: https://the-line.vercel.app) */
  constructor({ origin = "", ...options } = {}) {
    super(options);
    this.origin = origin;
  }

  #fail(error) {
    return SupabaseRepository.fail(AuthMessages.translate(error), { code: error?.code || null });
  }

  async signIn(form) {
    if (!this.configured) return this.notConfigured();
    const invalid = form.validate();
    if (invalid) return SupabaseRepository.fail(invalid);
    const { data, error } = await this.client.auth.signInWithPassword({ email: form.email, password: form.password });
    if (error) return this.#fail(error);
    return SupabaseRepository.ok({ user: data.user });
  }

  /** 가입 — Supabase 설정에서 "이메일 인증"이 켜져 있으면 session 없이 돌아오고(needsEmailConfirm),
   *  꺼져 있으면 바로 로그인 상태가 됩니다. */
  async signUp(form, { next } = {}) {
    if (!this.configured) return this.notConfigured();
    const invalid = form.validate();
    if (invalid) return SupabaseRepository.fail(invalid);
    const { data, error } = await this.client.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { name: form.name, terms_agreed_at: new Date().toISOString() },
        emailRedirectTo: AuthPaths.callbackUrl(this.origin, next),
      },
    });
    if (error) return this.#fail(error);
    // 이미 가입된 이메일이면 Supabase는 (보안상) 오류 대신 identities가 빈 사용자를 돌려줍니다.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return SupabaseRepository.fail(AuthMessages.translate("user_already_exists"));
    }
    return SupabaseRepository.ok({ user: data.user, needsEmailConfirm: !data.session });
  }

  /** 소셜 로그인 — 제공자 화면으로 이동했다가 /auth/callback으로 돌아옵니다. */
  async signInWithProvider(provider, { next } = {}) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.auth.signInWithOAuth({
      provider: provider.id,
      options: { redirectTo: AuthPaths.callbackUrl(this.origin, next) },
    });
    if (error) return this.#fail(error);
    return SupabaseRepository.ok();
  }

  async sendPasswordReset(email) {
    if (!this.configured) return this.notConfigured();
    const invalid = EmailRule.check(String(email || "").trim());
    if (invalid) return SupabaseRepository.fail(invalid);
    const { error } = await this.client.auth.resetPasswordForEmail(String(email).trim(), {
      redirectTo: AuthPaths.callbackUrl(this.origin, AuthPaths.UPDATE_PASSWORD),
    });
    if (error) return this.#fail(error);
    return SupabaseRepository.ok();
  }

  async updatePassword(form) {
    if (!this.configured) return this.notConfigured();
    const invalid = form.validate();
    if (invalid) return SupabaseRepository.fail(invalid);
    const { error } = await this.client.auth.updateUser({ password: form.password });
    if (error) return this.#fail(error);
    return SupabaseRepository.ok();
  }

  /** 이메일 인증·소셜 로그인·비밀번호 재설정 링크의 code → 로그인 세션(쿠키). */
  async exchangeCode(code) {
    if (!this.configured) return this.notConfigured();
    if (!code) return SupabaseRepository.fail("인증 정보가 없어요.");
    const { error } = await this.client.auth.exchangeCodeForSession(code);
    if (error) return this.#fail(error);
    return SupabaseRepository.ok();
  }

  async signOut() {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.auth.signOut();
    if (error) return this.#fail(error);
    return SupabaseRepository.ok();
  }
}
