import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AdminGuard } from "@/lib/memberAdminServer";
import { PageGuard } from "@/lib/pageGuard";

export const metadata = { title: "관리자" };

// 관리자 페이지 — 운영사(플랫폼) 채널 소유자만(AdminGuard). 지금은 회원 관리가 중심이고,
// 이후 메뉴(결제·채널 등)는 AdminMenu에 더합니다. 표가 넓어서 플랫폼 화면보다 넓게 씁니다.
const AdminMenu = Object.freeze([{ href: "/admin", label: "회원 관리" }]);

export default async function AdminLayout({ children }) {
  await PageGuard.requireSignIn("/admin");
  const guard = await AdminGuard.check();

  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-1.5 text-sm font-semibold text-stone-900">
            <ShieldCheck size={17} className="text-night-700" /> 더 라인 관리자
          </Link>
          <nav className="flex gap-1">
            {AdminMenu.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-full bg-night-700 px-3 py-1 text-xs font-medium text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link href="/" className="ml-auto text-xs text-stone-500 hover:text-stone-800">
            사이트로 →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {guard.allowed ? (
          children
        ) : (
          <p className="rounded-2xl border border-stone-200 bg-white px-4 py-12 text-center text-sm text-stone-500">
            {guard.reason === "not-configured"
              ? "서버 키(SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않아 관리자 페이지를 열 수 없어요."
              : "관리자만 볼 수 있는 페이지예요."}
          </p>
        )}
      </main>
    </div>
  );
}
