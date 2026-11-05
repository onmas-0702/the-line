import { redirect } from "next/navigation";
import SignUpFormView from "@/components/auth/SignUpFormView";
import { SafeRedirect } from "@/lib/auth";
import { ServerViewer } from "@/lib/supabaseServer";

export const metadata = { title: "회원가입" };

export default async function SignupPage({ searchParams }) {
  const params = await searchParams;
  const next = SafeRedirect.path(params.next);
  const viewer = await ServerViewer.current();
  if (viewer.isSignedIn && !viewer.isPreviewAdmin) redirect(next);
  return <SignUpFormView next={next} />;
}
