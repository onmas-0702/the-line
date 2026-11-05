export const metadata = { title: "이용약관" };

// ⚠️ 자리만 만들어 둔 화면입니다. 정식 이용약관·환불정책은 법률 검토 후 이 파일에 넣어주세요
// (회원가입·구독 화면이 이 주소로 연결됩니다).
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-xl space-y-3 py-6 text-sm leading-relaxed text-stone-700">
      <h1 className="text-lg font-semibold text-stone-900">이용약관 · 환불정책</h1>
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
        정식 약관을 준비하고 있어요. 정식 오픈 전에 이 자리에 게시됩니다.
      </p>
    </article>
  );
}
