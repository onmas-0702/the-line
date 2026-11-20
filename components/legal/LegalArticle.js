// 이용약관(환불정책 포함)·개인정보처리방침 화면 — 문서 내용(lib/legalDocuments.js의 LegalDocument)을 그대로 그립니다.
// 맨 위 이전 버튼, 아래 메뉴(홈)는 PlatformChrome이 그립니다(마이 페이지와 같은 구조).

import BackButton from "@/components/common/BackButton";

export default function LegalArticle({ document: doc }) {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-stone-700">
      <BackButton fallbackHref="/" />
      <header className="space-y-1.5">
        <h1 className="text-xl font-semibold text-stone-900">{doc.title}</h1>
        <p className="text-xs text-stone-400">시행일 {doc.effectiveDate}</p>
        {doc.intro && <p className="pt-1">{doc.intro}</p>}
      </header>

      {doc.sections.map((section) => (
        <section key={section.heading} id={section.id} className="scroll-mt-6 space-y-2">
          <h2 className="text-base font-semibold text-stone-900">{section.heading}</h2>
          {section.items && (
            <ul className="list-disc space-y-1 pl-5">
              {section.items.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {section.paragraphs?.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
