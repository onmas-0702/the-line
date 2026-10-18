// 플랫폼 이름 — 여러 방송 채널(A, B, C …)을 담는 서비스 전체의 이름입니다.
export const PLATFORM_NAME = "더 라인";

// 랜딩 페이지 상단에 보이는 플랫폼 표기. 로고 디자인이 나오면 이미지로 교체합니다.
export const PLATFORM_TITLE = "은혜의 밤, 더 라인";

// 랜딩 페이지 하단 제작사 정보 — 빈 값은 화면에 "입력 예정"으로 보입니다.
// 실제 정보가 정해지면 여기만 채우면 됩니다.
export const PLATFORM_INFO = {
  companyName: "",
  representative: "",
  businessNumber: "",
  address: "",
  phone: "",
  email: "",
  refundPolicy: [
    // 예: "결제 후 7일 이내, 스튜디오를 사용하지 않은 경우 전액 환불됩니다."
  ],
};

// 기본 채널(채널 A)의 이름. channels 테이블이 아직 없을 때의 표시 이름으로도 씁니다.
export const SITE_NAME = "은혜의 밤 더 라인";

export const SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "title", label: "제목순" },
];

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

// 오디오 업로드 시 선택하는 기본 카테고리 — 검색/분류에 사용됩니다.
export const CATEGORY_OPTIONS = [
  "새벽기도",
  "주일설교",
  "묵상나눔",
  "심방·위로",
  "청년·다음세대",
  "간증",
  "절기·특별집회",
  "기타",
];

// 배경음악 분류(악기 → 분위기)는 lib/musicTaxonomy.js의 MusicTaxonomy에 있습니다.

// 다른 채널의 "공식 라이브러리" 샘플(읽기 전용) — 공용 자산 라이브러리 화면이 생기면 실제 곡으로 바뀝니다.
export const officialBackgroundThemes = [
  {
    id: "theme-meditation",
    name: "묵상 · 새벽",
    tracks: [
      { id: "bg1", name: "잔잔한 피아노", duration: "05:00" },
      { id: "bg3", name: "새벽 현악 앙상블", duration: "06:00" },
    ],
  },
  {
    id: "theme-comfort",
    name: "위로 · 포근함",
    tracks: [{ id: "bg2", name: "따뜻한 어쿠스틱 기타", duration: "04:30" }],
  },
  {
    id: "theme-none",
    name: "음성만",
    tracks: [{ id: "bg4", name: "배경음악 없음", duration: "-" }],
  },
];

// 개인이 직접 업로드해서 보관하는 배경음악 라이브러리 (업로드/삭제 가능)
export const initialPersonalTracks = [
  { id: "pbg1", name: "우리 교회 반주팀 데모곡", duration: "03:40", genres: [], themes: [] },
];

// 메인 피드 — 구독자들이 함께 보는 화면의 오디오 목록
export const initialAudios = [
  {
    id: "a1",
    title: "오늘 하루, 작은 순종이 만드는 은혜",
    pastorName: "김은혜 목사",
    church: "새빛교회",
    date: "2026-09-07",
    duration: "04:12",
    plays: 128,
    hasScript: true,
    scriptFileName: "0907_묵상나눔_대본.docx",
  },
  {
    id: "a2",
    title: "추석 특별 새벽기도 나눔",
    pastorName: "김은혜 목사",
    church: "새빛교회",
    date: "2026-08-28",
    duration: "07:03",
    plays: 54,
    hasScript: false,
    scriptFileName: "",
  },
  {
    id: "a3",
    title: "지친 마음에게 건네는 시편 23편",
    pastorName: "박소망 목사",
    church: "다리교회",
    date: "2026-09-06",
    duration: "06:45",
    plays: 96,
    hasScript: true,
    scriptFileName: "시편23편_나눔.txt",
  },
  {
    id: "a4",
    title: "월요일 아침, 다시 시작하는 용기",
    pastorName: "이믿음 목사",
    church: "은혜동산교회",
    date: "2026-09-05",
    duration: "03:58",
    plays: 214,
    hasScript: false,
    scriptFileName: "",
  },
  {
    id: "a5",
    title: "기도가 막힐 때 드리는 짧은 고백",
    pastorName: "최사랑 목사",
    church: "빛과소금교회",
    date: "2026-09-04",
    duration: "05:21",
    plays: 71,
    hasScript: false,
    scriptFileName: "",
  },
];

export function todayLabel() {
  return new Date().toISOString().slice(0, 10);
}
