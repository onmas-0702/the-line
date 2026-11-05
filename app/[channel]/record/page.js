import { redirect } from "next/navigation";

// 예전 주소(/{채널}/record, 이전 이름 "제작/관리") → 스튜디오(/{채널}/studio). ?tab=도 그대로 넘깁니다.
export default async function LegacyStudioRedirect({ params, searchParams }) {
  const { channel } = await params;
  const { tab } = await searchParams;
  const query = typeof tab === "string" ? `?tab=${encodeURIComponent(tab)}` : "";
  redirect(`/${encodeURIComponent(channel)}/studio${query}`);
}
