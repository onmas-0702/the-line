"use client";

// 기능을 못 쓸 때의 안내 링크 — 로그인이 필요하면 로그인으로, 구독이 필요하면 구독 안내로.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthPaths } from "@/lib/auth";
import { SubscriptionPaths } from "@/lib/subscription";

export default function GatePrompt({ gate, action, className = "", tone = "light" }) {
  const pathname = usePathname();
  if (gate.allowed) return null;
  const isSignin = gate.needs === "signin";
  const href = isSignin ? AuthPaths.login(pathname) : SubscriptionPaths.PRICING;
  const text = isSignin ? `로그인하고 ${action}` : `구독하고 ${action}`;
  const color = tone === "dark" ? "text-white underline" : "text-amber-700 hover:underline";
  return (
    <Link href={href} className={`text-xs font-medium ${color} ${className}`}>
      {text}
    </Link>
  );
}
