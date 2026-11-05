import { redirect } from "next/navigation";
import { ChannelSlug } from "@/lib/channel";

// 채널 구조 도입 전의 주소(/record)로 들어오면 기본 채널의 스튜디오로 보냅니다.
export default function LegacyRecordRedirect() {
  redirect(`/${ChannelSlug.DEFAULT}/studio`);
}
