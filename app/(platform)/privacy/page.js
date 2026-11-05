export const metadata = { title: "개인정보 처리방침" };

// ⚠️ 자리만 만들어 둔 화면입니다. 정식 개인정보 처리방침은 검토 후 이 파일에 넣어주세요.
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-xl space-y-3 py-6 text-sm leading-relaxed text-stone-700">
      <h1 className="text-lg font-semibold text-stone-900">개인정보 처리방침</h1>
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
        정식 방침을 준비하고 있어요. 지금은 가입 시 이름(닉네임)과 이메일만 받으며, 서비스 제공 외의 목적으로 쓰지 않아요.
      </p>
    </article>
  );
}
