import { redirect } from "next/navigation";

// 영감노트 기능은 제거되었습니다. 이전 링크로 들어오는 경우 홈으로 보냅니다.
export default function NotesRemoved() {
  redirect("/");
}
