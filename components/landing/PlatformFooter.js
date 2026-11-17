import { InstallGuideLink } from "@/components/InstallBanner";
import Link from "next/link";
import { REFUND_POLICY } from "@/lib/legalDocuments";
import { PLATFORM_INFO, PLATFORM_TITLE } from "@/lib/mockData";

// 랜딩 페이지 맨 아래 — 약관 링크 줄(개인정보처리방침은 법에 따라 굵게), 사업자 정보, 환불정책 요약.
// 사업자 정보는 lib/mockData.js의 PLATFORM_INFO, 약관·환불정책은 lib/legalDocuments.js.

function InfoLine({ label, value, href, placeholder = "입력 예정" }) {
  return (
    <p>
      <span className="text-stone-400">{label}</span>{" "}
      {value ? (
        href ? (
          <a href={href} className="text-stone-600 underline-offset-2 hover:underline">
            {value}
          </a>
        ) : (
          <span className="text-stone-600">{value}</span>
        )
      ) : (
        <span className="text-stone-300">{placeholder}</span>
      )}
    </p>
  );
}

export default function PlatformFooter() {
  const info = PLATFORM_INFO;
  return (
    <footer className="mt-6 border-t border-stone-200 bg-stone-100/70 px-4 pb-10 pt-6 text-xs leading-relaxed">
      <p className="text-sm font-semibold text-stone-700">{PLATFORM_TITLE}</p>
      <InstallGuideLink className="mt-2 rounded-full border border-night-200 bg-white px-3 py-1.5 text-xs font-medium text-night-800" />

      <nav aria-label="약관" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-stone-500">
        <Link href="/terms" className="hover:text-stone-800 hover:underline">
          이용약관
        </Link>
        <span aria-hidden className="text-stone-300">|</span>
        <Link href="/privacy" className="font-bold text-stone-800 hover:underline">
          개인정보처리방침
        </Link>
        <span aria-hidden className="text-stone-300">|</span>
        <Link href="/terms#refund" className="hover:text-stone-800 hover:underline">
          환불정책
        </Link>
      </nav>

      <div className="mt-3 space-y-1">
        <InfoLine label="상호" value={info.companyName} />
        <InfoLine label="대표자" value={info.representative} />
        <InfoLine label="사업자등록번호" value={info.businessNumber} />
        <InfoLine label="통신판매업 신고" value={info.mailOrderNumber} placeholder="신고 준비 중" />
        <InfoLine label="주소" value={info.address} />
        <InfoLine label="전화" value={info.phone} href={info.phone ? `tel:${info.phone}` : undefined} />
        <InfoLine label="이메일" value={info.email} href={info.email ? `mailto:${info.email}` : undefined} />
        <InfoLine label="호스팅 제공자" value={info.hostingProvider} />
      </div>

      <details className="mt-4 rounded-xl bg-white px-3 py-2 text-stone-600">
        <summary className="cursor-pointer select-none font-medium text-stone-700">환불정책</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {REFUND_POLICY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      <p className="mt-5 text-[11px] text-stone-400">
        © {new Date().getFullYear()} {info.companyName || PLATFORM_TITLE}. All rights reserved.
      </p>
    </footer>
  );
}
