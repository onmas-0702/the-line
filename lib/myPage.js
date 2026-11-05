// 마이 페이지 — 구독자의 개인 공간. 메뉴는 MyPageMenu 한 곳에 등록되어 있어서, 새 기능을
// 넣을 때는 (1) 여기 섹션 하나를 추가하고 (2) components/mypage/sections.js에 같은 key로
// 화면 컴포넌트를 연결하면 됩니다(주소 /mypage/{key}는 자동으로 생깁니다).
//
// 서버·클라이언트 양쪽에서 쓰므로 "use client"를 붙이지 않습니다.

import { AudioMarkKind } from "@/lib/engagement";
import { AccessPolicy, FeatureGate } from "@/lib/access";

export class MyPageSection {
  /** staffView: 운영자에게는 다르게 보일 때 { label, description, appliesTo(viewer) } */
  constructor({ key, label, description, feature = null, staffView = null }) {
    this.key = key;
    this.label = label;
    this.description = description;
    this.feature = feature; // FeatureGate.Feature — null이면 로그인만 하면 됨
    this.staffView = staffView;
    Object.freeze(this);
  }

  /** 이 사람에게 운영자용 화면을 보여줄지. */
  isStaffViewFor(viewer) {
    return Boolean(this.staffView?.appliesTo(viewer));
  }

  labelFor(viewer) {
    return this.isStaffViewFor(viewer) ? this.staffView.label : this.label;
  }

  descriptionFor(viewer) {
    return this.isStaffViewFor(viewer) ? this.staffView.description : this.description;
  }

  get path() {
    return `${MyPageMenu.BASE_PATH}/${this.key}`;
  }

  gateFor(viewer) {
    return this.feature ? FeatureGate.check(viewer, this.feature) : new FeatureGate(viewer.isSignedIn, viewer.isSignedIn ? null : "signin");
  }
}

export class MyPageMenu {
  static TITLE = "마이 페이지";
  static BASE_PATH = "/mypage";

  static SECTIONS = Object.freeze([
    new MyPageSection({
      key: "notices",
      label: "운영자 공지",
      description: "채널 운영자가 구독자에게 보낸 소식이에요.",
      feature: FeatureGate.Feature.NOTICES,
      // 공지를 맡은 운영자(메인 운영자 등)는 읽는 쪽이 아니라 쓰는 쪽 — "공지 작성"
      staffView: {
        label: "공지 작성",
        description: "구독자에게 보낼 공지를 쓰고, 고정하거나 지울 수 있어요.",
        appliesTo: (viewer) => AccessPolicy.canWriteNotices(viewer),
      },
    }),
    new MyPageSection({
      key: "saved",
      label: "담아두기",
      description: "좋아요·담아두기한 메시지를 모아 보고 찾아볼 수 있어요.",
      feature: FeatureGate.Feature.SAVE,
    }),
    new MyPageSection({
      key: "journal",
      label: "감상일기",
      description: "메시지를 듣고 남긴 나만의 기록이에요.",
      feature: FeatureGate.Feature.JOURNAL,
    }),
    new MyPageSection({
      key: "community",
      label: "오픈채팅 참여",
      description: "구독자와 운영자가 함께하는 카카오톡 오픈채팅방이에요.",
      feature: FeatureGate.Feature.COMMUNITY,
    }),
  ]);

  static find(key) {
    return MyPageMenu.SECTIONS.find((section) => section.key === key) || null;
  }
}

/** 검색어를 공백으로 나눠, 모든 낱말이 들어 있는 항목만 남깁니다(대소문자 무시). */
class TextSearch {
  constructor(text = "") {
    this.terms = String(text).toLowerCase().split(/\s+/).filter(Boolean);
    Object.freeze(this);
  }

  matches(haystack) {
    if (this.terms.length === 0) return true;
    const target = haystack.filter(Boolean).join(" ").toLowerCase();
    return this.terms.every((term) => target.includes(term));
  }
}

/** 담아두기 목록 검색·필터(불변). items: MarkedAudio[] */
export class SavedAudioQuery {
  static Filter = Object.freeze({ ALL: "all", LIKE: AudioMarkKind.LIKE, SAVE: AudioMarkKind.SAVE });
  static FILTER_LABELS = { all: "전체", like: "좋아요", save: "담아두기" };

  constructor({ text = "", filter = SavedAudioQuery.Filter.ALL } = {}) {
    this.text = text;
    this.filter = filter;
    Object.freeze(this);
  }

  with(patch) {
    return new SavedAudioQuery({ ...this, ...patch });
  }

  apply(items) {
    const search = new TextSearch(this.text);
    return items.filter((item) => {
      if (this.filter !== SavedAudioQuery.Filter.ALL && !item.kinds.includes(this.filter)) return false;
      const row = item.audioRow;
      return search.matches([
        row.title,
        row.pastor_name,
        row.church,
        row.scripture_reference,
        row.category,
        row.description,
        ...(row.tags || []),
      ]);
    });
  }
}

/** 감상일기 검색(일기 내용 + 짝이 되는 메시지 제목·설교자·본문). entries: JournalEntry[] */
export class JournalQuery {
  constructor(text = "") {
    this.text = text;
    Object.freeze(this);
  }

  apply(entries) {
    const search = new TextSearch(this.text);
    return entries.filter((entry) =>
      search.matches([entry.body, entry.audioRow?.title, entry.audioRow?.pastor_name, entry.audioRow?.scripture_reference])
    );
  }

  /** 같은 메시지에 쓴 일기끼리 묶습니다(메시지별로 최신 일기 순). */
  static groupByAudio(entries) {
    const groups = new Map();
    for (const entry of entries) {
      const key = entry.audioId || `deleted:${entry.id}`;
      if (!groups.has(key)) groups.set(key, { audioId: entry.audioId, audioRow: entry.audioRow, entries: [] });
      groups.get(key).entries.push(entry);
    }
    return [...groups.values()];
  }
}
