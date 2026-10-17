import { redirect } from "next/navigation";
import { ChannelSlug } from "@/lib/channel";

// ⚠️ 임시 — 회원가입·로그인(Supabase Auth)을 붙이기 전까지, 사이트의 모든 "로그인" 버튼은
// 운영자가 바로 기본 채널('은혜의 밤, 더 라인')의 제작/관리 화면으로 들어가는 입구로 씁니다.
// 로그인 기능을 만들 때 이 파일을 실제 로그인 화면으로 바꾸고, 제작/관리 화면은
// AccessPolicy.canManageChannel로 막아야 합니다(지금은 주소를 아는 누구나 들어갈 수 있음).
// 예전 로그인 와이어프레임 화면은 git 기록(커밋 a9f51b9의 이 파일)에 있습니다.
export default function LoginPage() {
  redirect(`/${ChannelSlug.DEFAULT}/record`);
}
