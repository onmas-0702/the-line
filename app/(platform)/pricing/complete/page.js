import Link from "next/link";
import { CheckCircle2, CreditCard, XCircle } from "lucide-react";
import ConfirmMembership from "@/components/subscription/ConfirmMembership";
import { MyPageMenu } from "@/lib/myPage";
import { SubscriptionPaths } from "@/lib/subscription";
import { SupportContact } from "@/lib/support";

export const metadata = { title: "결제 결과" };

// 결제 결과 화면. step=confirm&oid=…이면(팝업 없이 카드 등록을 마치고 돌아옴) 여기서 가입 확정(첫 결제)을 부릅니다.
export default async function PricingCompletePage({ searchParams }) {
  const { result, message, step, oid } = await searchParams;
  if (step === "confirm" && oid) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center">
        <CreditCard size={40} className="mx-auto text-night-700" />
        <ConfirmMembership oid={String(oid)} />
      </div>
    );
  }
  const ok = result === "ok";
  return (
    <div className="mx-auto max-w-md space-y-4 py-10 text-center">
      {ok ? <CheckCircle2 size={40} className="mx-auto text-emerald-500" /> : <XCircle size={40} className="mx-auto text-rose-500" />}
      <h1 className="text-lg font-semibold text-stone-900">{ok ? "멤버십 가입을 마쳤어요" : "결제를 마치지 못했어요"}</h1>
      <p className="text-sm leading-relaxed text-stone-500">
        {ok
          ? "지금부터 구독 기능을 모두 쓸 수 있어요. 다음 결제일과 결제 내역은 마이 페이지 > 멤버십에서 볼 수 있어요."
          : message || "카드 등록이나 결제가 취소되었어요. 결제된 금액은 없어요."}
      </p>
      <div className="flex justify-center gap-2 pt-2">
        {ok ? (
          <Link href={`${MyPageMenu.BASE_PATH}/membership`} className="rounded-full bg-night-700 px-5 py-2 text-sm font-semibold text-white">
            내 멤버십 보기
          </Link>
        ) : (
          <>
            <Link href={SubscriptionPaths.PRICING} className="rounded-full bg-night-700 px-5 py-2 text-sm font-semibold text-white">
              다시 시도하기
            </Link>
            <Link href={SupportContact.PATH} className="rounded-full border border-stone-300 px-5 py-2 text-sm text-stone-700">
              문의하기
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
