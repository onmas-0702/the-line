import { redirect } from "next/navigation";

// 마이페이지 기능은 제거되었습니다. 이전 링크로 들어오는 경우 홈으로 보냅니다.
export default function MyPageRemoved() {
  redirect("/");
}
