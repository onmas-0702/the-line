import Link from "next/link";
import { ChevronDown, Mail, Phone } from "lucide-react";
import BackButton from "@/components/common/BackButton";
import { SupportContact, SupportFaq } from "@/lib/support";

export const metadata = {
  title: "고객지원",
  description: "더 라인 이용 문의와 자주 묻는 질문",
};

// 고객지원 — 앱스토어·구글 플레이의 "지원 URL"로 등록하는 페이지. 문구는 lib/support.js에서 고칩니다.
export default function SupportPage() {
  return (
    <div className="space-y-6">
      <BackButton fallbackHref="/" />
      <div>
        <h1 className="text-lg font-semibold text-stone-900">고객지원</h1>
        <p className="mt-1 text-sm text-stone-500">궁금한 점이나 불편한 점이 있으면 언제든 알려 주세요.</p>
      </div>

      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-900">문의하기</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href={SupportContact.mailto()}
            className="flex items-center gap-3 rounded-xl bg-night-700 px-4 py-3 text-white transition hover:bg-night-800"
          >
            <Mail size={18} className="shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">이메일 문의</span>
              <span className="block truncate text-xs text-white/80">{SupportContact.email}</span>
            </span>
          </a>
          {SupportContact.phone && (
            <a
              href={`tel:${SupportContact.phone}`}
              className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-stone-800 transition hover:bg-stone-50"
            >
              <Phone size={18} className="shrink-0 text-stone-500" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">전화 문의</span>
                <span className="block text-xs text-stone-500">{SupportContact.phone}</span>
              </span>
            </a>
          )}
        </div>
        <p className="text-xs leading-relaxed text-stone-500">{SupportContact.RESPONSE_TIME}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-stone-900">자주 묻는 질문</h2>
        {SupportFaq.ALL.map((group) => (
          <div key={group.id} id={group.id} className="scroll-mt-20">
            <h3 className="mb-2 text-xs font-semibold text-night-700">{group.topic}</h3>
            <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {group.items.map((item) => (
                <details key={item.q} className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-stone-800">
                    {item.q}
                    <ChevronDown size={16} className="shrink-0 text-stone-400 transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{item.a}</p>
                  {item.link && (
                    <Link href={item.link.href} className="mt-2 inline-block text-xs font-medium text-night-700 underline-offset-2 hover:underline">
                      {item.link.label} →
                    </Link>
                  )}
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>

      <nav aria-label="약관" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
        <Link href="/terms" className="hover:underline">이용약관</Link>
        <Link href="/privacy" className="font-semibold text-stone-700 hover:underline">개인정보처리방침</Link>
        <Link href="/terms#refund" className="hover:underline">환불정책</Link>
      </nav>
    </div>
  );
}
