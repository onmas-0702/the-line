import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { SafeRedirect } from "@/lib/auth";
import { ServerViewer } from "@/lib/supabaseServer";

export const metadata = { title: "로그인" };

const NOTICES = {
  "password-updated": "비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.",
};

// 로그인 화면. ?next=로 로그인 뒤 돌아갈 주소를 받습니다(우리 사이트 안의 주소만).
export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = SafeRedirect.path(params.next);
  const viewer = await ServerViewer.current();
  if (viewer.isSignedIn && !viewer.isPreviewAdmin) redirect(next);

  return (
    <LoginForm
      next={next}
      initialError={params.error ? String(params.error) : ""}
      notice={NOTICES[params.notice] || ""}
    />
  );
}
