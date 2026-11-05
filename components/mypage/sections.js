"use client";

// 마이 페이지 섹션 key → 화면 컴포넌트. 메뉴 정보(이름·설명·권한)는 lib/myPage.js의 MyPageMenu에
// 있고, 새 메뉴를 만들 때는 그쪽에 섹션을 추가한 뒤 여기에 같은 key로 화면을 연결합니다.

import CommunitySection from "@/components/mypage/CommunitySection";
import JournalSection from "@/components/mypage/JournalSection";
import NoticesSection from "@/components/mypage/NoticesSection";
import SavedSection from "@/components/mypage/SavedSection";

export const MY_PAGE_SECTION_VIEWS = Object.freeze({
  notices: NoticesSection,
  saved: SavedSection,
  journal: JournalSection,
  community: CommunitySection,
});
