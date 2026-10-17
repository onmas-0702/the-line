import { redirect } from "next/navigation";
import { ChannelSlug } from "@/lib/channel";

// 대표 주소("/")는 나중에 플랫폼 소개·채널 목록·채널 개설 신청 화면이 들어갈
// 자리입니다. 지금은 기본 채널(채널 A)로 보냅니다.
export default function PlatformHome() {
  redirect(`/${ChannelSlug.DEFAULT}`);
}
