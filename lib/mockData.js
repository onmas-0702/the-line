export const SITE_NAME = "은혜의 밤 더 라인";

export const SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "title", label: "제목순" },
];

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

// 플랫폼이 공식적으로 큐레이션해서 제공하는 배경음악 (읽기 전용 — 업로드/삭제 불가)
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
  { id: "pbg1", name: "우리 교회 반주팀 데모곡", duration: "03:40" },
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
