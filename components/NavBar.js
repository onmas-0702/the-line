"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Mic, NotebookPen, User, LogIn } from "lucide-react";
import { SITE_NAME } from "@/lib/mockData";

const links = [
  { href: "/", label: "홈", icon: Home },
  { href: "/record", label: "녹음/믹싱", icon: Mic },
  { href: "/notes", label: "영감노트", icon: NotebookPen },
  { href: "/mypage", label: "마이페이지", icon: User },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-700 text-sm font-semibold text-white">
              은
            </span>
            <span className="text-sm font-semibold text-stone-800 sm:text-base">
              {SITE_NAME}
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex sm:gap-2">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-amber-700 text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/login"
              className={`ml-1 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                pathname === "/login"
                  ? "border-amber-700 text-amber-700"
                  : "border-stone-300 text-stone-500 hover:bg-stone-100"
              }`}
            >
              로그인
            </Link>
          </nav>

          <Link
            href="/login"
            className={`flex h-9 w-9 items-center justify-center rounded-full border sm:hidden ${
              pathname === "/login"
                ? "border-amber-700 text-amber-700"
                : "border-stone-300 text-stone-500"
            }`}
            aria-label="로그인"
          >
            <LogIn size={16} />
          </Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2 py-1.5">
          {links.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium transition ${
                  active ? "text-amber-700" : "text-stone-500"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
