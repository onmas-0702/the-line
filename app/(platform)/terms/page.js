import LegalArticle from "@/components/legal/LegalArticle";
import { TERMS } from "@/lib/legalDocuments";

export const metadata = { title: "이용약관" };

// 이용약관(환불정책은 제6조, 주소 /terms#refund). 내용은 lib/legalDocuments.js에서 고칩니다.
export default function TermsPage() {
  return <LegalArticle document={TERMS} />;
}
