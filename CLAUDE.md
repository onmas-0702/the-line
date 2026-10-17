@AGENTS.md

# 프로젝트 고정 규칙

1. **모든 코딩은 확장성을 위해 객체지향 형태로 한다.**
   - 로직(데이터 처리, 저장소, 권한 규칙, 오디오 처리 등)은 `lib/` 아래 클래스로 만든다.
     예: `SupabaseRepository` 상속 저장소, `Channel`, `AccessPolicy`, `Timeline`, `FeedSections`.
   - React 컴포넌트는 함수형 + hooks로 두고(클래스 컴포넌트 금지 — React 19에서 레거시),
     컴포넌트 안의 로직은 위 클래스들에 맡긴다.
   - React 상태에 넣는 객체는 평범한 객체로 두거나, 불변 클래스(변경 시 새 인스턴스 반환)로 만든다.
