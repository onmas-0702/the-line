import { SITE_NAME } from "@/lib/mockData";

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center justify-center py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-700 text-xl font-semibold text-white">
        은
      </span>
      <h1 className="mt-4 text-xl font-semibold text-stone-900">
        {SITE_NAME}
      </h1>
      <p className="mt-2 text-sm text-stone-500">
        동료 목회자들과 짧은 은혜의 순간을 나눠보세요.
      </p>

      <div className="mt-8 w-full space-y-3">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
        >
          Google로 계속하기
        </button>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-2.5 text-sm font-medium text-stone-900 transition hover:brightness-95"
        >
          카카오로 계속하기
        </button>
      </div>

      <p className="mt-6 text-xs text-stone-400">
        (와이어프레임 단계 — 실제 로그인은 연결되어 있지 않습니다)
      </p>
    </div>
  );
}
