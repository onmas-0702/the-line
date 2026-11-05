import PricingView from "@/components/subscription/PricingView";
import { PlanRepository } from "@/lib/subscription";
import { ServerViewer } from "@/lib/supabaseServer";

export const metadata = { title: "구독 안내" };

// 플랫폼 유료 구독 안내·신청. 요금제는 DB(plans)에서 읽고, 결제는 PaymentGateway가 맡습니다.
export default async function PricingPage() {
  const [viewer, { plans }] = await Promise.all([ServerViewer.current(), new PlanRepository().listMembership()]);
  return <PricingView viewer={viewer.toJSON()} plans={plans.map((plan) => ({ ...plan }))} />;
}
