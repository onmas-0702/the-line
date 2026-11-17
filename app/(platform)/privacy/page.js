import LegalArticle from "@/components/legal/LegalArticle";
import { PRIVACY } from "@/lib/legalDocuments";

export const metadata = { title: "개인정보처리방침" };

// 개인정보처리방침. 내용은 lib/legalDocuments.js에서 고칩니다.
export default function PrivacyPage() {
  return <LegalArticle document={PRIVACY} />;
}
