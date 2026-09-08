export const SITE_NAME = "은혜의 밤 더 라인";

export const CATEGORIES = ["주일설교", "새벽기도", "심방나눔", "묵상", "기타"];

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

export const initialAudios = [
  {
    id: "a1",
    title: "오늘 하루, 작은 순종이 만드는 은혜",
    pastorName: "김은혜 목사",
    church: "새빛교회",
    date: "2026-09-07",
    duration: "04:12",
    plays: 128,
    category: "묵상",
    owner: "me",
    savedByMe: false,
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
    category: "새벽기도",
    owner: "me",
    savedByMe: false,
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
    category: "묵상",
    owner: "other",
    savedByMe: false,
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
    category: "심방나눔",
    owner: "other",
    savedByMe: false,
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
    category: "주일설교",
    owner: "other",
    savedByMe: false,
    hasScript: false,
    scriptFileName: "",
  },
];

export const initialNotes = [
  {
    id: "n1",
    date: "2026-09-06",
    audioId: "a3",
    content:
      "박소망 목사님 나눔 듣다가: 시편 23편을 '결핍이 없다'가 아니라 '부족함을 부족함으로 느끼지 않는 은혜'로 푸신 부분이 마음에 남는다. 다음 주 심방 때 이 표현 써봐야겠다.",
  },
  {
    id: "n2",
    date: "2026-09-05",
    audioId: null,
    content:
      "월요병으로 지친 성도들에게 '다시 시작하는 용기'라는 제목 자체가 위로가 된다. 우리 교회 청년부 카톡방에도 공유하면 좋겠음.",
  },
];

export function deriveTitle(content) {
  if (!content) return "제목 없음";
  const firstLine = content.split("\n")[0].trim();
  const words = firstLine.split(/\s+/).slice(0, 10).join(" ");
  return words.length < firstLine.length ? words + "…" : words || "제목 없음";
}

export function todayLabel() {
  return new Date().toISOString().slice(0, 10);
}
