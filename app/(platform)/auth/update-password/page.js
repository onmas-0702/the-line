import { redirect } from "next/navigation";
import UpdatePasswordForm from "@/components/auth/UpdatePasswordForm";
import { AuthPaths } from "@/lib/auth";
import { ServerViewer } from "@/lib/supabaseServer";

export const metadata = { title: "새 비밀번호" };

// 비밀번호 재설정 메일의 링크 → /auth/callback(로그인 처리) → 여기서 새 비밀번호 입력.
export default async function UpdatePasswordPage() {
  const viewer = await ServerViewer.current();
  if (!viewer.isSignedIn) redirect(AuthPaths.FORGOT_PASSWORD);
  return <UpdatePasswordForm />;
}
