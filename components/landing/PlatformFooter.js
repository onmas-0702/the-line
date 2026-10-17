import { InstallGuideLink } from "@/components/InstallBanner";
import { PLATFORM_INFO, PLATFORM_TITLE } from "@/lib/mockData";

// 랜딩 페이지 맨 아래 제작사 정보·환불정책·연락처. 값은 lib/mockData.js의 PLATFORM_INFO.

function InfoLine({ label, value, href }) {
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
        <span className="text-stone-300">입력 예정</span>
      )}
    </p>
  );
}

export default function PlatformFooter() {
  const info = PLATFORM_INFO;
  return (
    <footer className="mt-6 border-t border-stone-200 bg-stone-100/70 px-4 pb-10 pt-6 text-xs leading-relaxed">
      <p className="text-sm font-semibold text-stone-700">{PLATFORM_TITLE}</p>
      <InstallGuideLink className="mt-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-800" />

      <div className="mt-3 space-y-1">
        <InfoLine label="제작사" value={info.companyName} />
        <InfoLine label="대표" value={info.representative} />
        <InfoLine label="사업자등록번호" value={info.businessNumber} />
        <InfoLine label="주소" value={info.address} />
        <InfoLine label="연락처" value={info.phone} href={info.phone ? `tel:${info.phone}` : undefined} />
        <InfoLine label="메일" value={info.email} href={info.email ? `mailto:${info.email}` : undefined} />
      </div>

      <details className="mt-4 rounded-xl bg-white px-3 py-2 text-stone-600">
        <summary className="cursor-pointer select-none font-medium text-stone-700">환불정책</summary>
        {info.refundPolicy.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {info.refundPolicy.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-stone-400">환불정책은 유료회원 요금제가 확정되면 게시됩니다.</p>
        )}
      </details>

      <p className="mt-5 text-[11px] text-stone-400">
        © {new Date().getFullYear()} {info.companyName || PLATFORM_TITLE}. All rights reserved.
      </p>
    </footer>
  );
}
