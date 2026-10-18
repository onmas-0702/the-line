// 배경음악 분류 — 악기(카테고리) → 분위기(무드) 2단계 트리.
// 자유 태그가 아니라 이 고정 목록에서 고르게 해서, 표기가 제각각이 되어 필터가 무의미해지는
// 걸 막습니다. 목록을 바꾸려면 MusicTaxonomy.CATEGORIES만 고치면 업로드·필터·목록에 함께
// 반영됩니다. DB(background_tracks)에는 genres = [카테고리 id], themes = [무드 id]로 저장합니다.

export class MusicMood {
  constructor({ id, label }) {
    this.id = id;
    this.label = label;
  }
}

export class MusicCategory {
  constructor({ id, label, moods = [] }) {
    this.id = id;
    this.label = label;
    this.moods = moods.map((m) => new MusicMood(m));
  }

  /** "01_Piano" → "01" (화면에서 순서 번호로 씁니다). */
  get number() {
    return this.id.split("_")[0];
  }

  get hasMoods() {
    return this.moods.length > 0;
  }

  mood(id) {
    return this.moods.find((m) => m.id === id) || null;
  }
}

export class MusicTaxonomy {
  static CATEGORIES = [
    new MusicCategory({
      id: "01_Piano",
      label: "피아노",
      moods: [
        { id: "Warm_Comfort", label: "따뜻·위로" },
        { id: "Calm_Peaceful", label: "차분·평안" },
        { id: "Hopeful", label: "희망·여운" },
      ],
    }),
    new MusicCategory({
      id: "02_Acoustic_Guitar",
      label: "기타·따뜻함",
      moods: [
        { id: "Gentle_Talk", label: "친근·대화" },
        { id: "Deep_Comfort", label: "깊은 위로" },
      ],
    }),
    new MusicCategory({
      id: "03_Ambient_Pad",
      label: "패드·공간음",
      moods: [
        { id: "Minimal_Prayer", label: "극도로 잔잔·기도/설교용" },
        { id: "Warm_Atmosphere", label: "포근한 공간감" },
      ],
    }),
    new MusicCategory({
      id: "04_Strings_Orchestral",
      label: "현악·서사",
      moods: [{ id: "Emotional_Deep", label: "감성·은혜" }],
    }),
    new MusicCategory({ id: "05_LoFi_Chill", label: "포근한 비트" }),
  ];

  /** 분류가 없거나 목록에 없는 예전 태그만 붙은 트랙을 모아두는 자리. */
  static UNCLASSIFIED = "unclassified";

  static category(id) {
    return MusicTaxonomy.CATEGORIES.find((c) => c.id === id) || null;
  }
}

/** 트랙 하나의 분류(카테고리 + 무드). 불변 — 바꿀 땐 새 객체를 만듭니다. */
export class TrackClassification {
  constructor(categoryId = null, moodId = null) {
    const category = MusicTaxonomy.category(categoryId);
    this.category = category;
    // 무드는 그 카테고리에 속한 것만 인정합니다.
    this.mood = category?.mood(moodId) || null;
  }

  static fromTrack(track) {
    const categoryId = (track.genres || []).find((g) => MusicTaxonomy.category(g)) || null;
    const category = MusicTaxonomy.category(categoryId);
    const moodId = (track.themes || []).find((t) => category?.mood(t)) || null;
    return new TrackClassification(categoryId, moodId);
  }

  get isClassified() {
    return this.category !== null;
  }

  /** 목록 묶음·필터에 쓰는 키(미분류 포함). */
  get categoryKey() {
    return this.category?.id || MusicTaxonomy.UNCLASSIFIED;
  }

  get label() {
    if (!this.category) return "미분류";
    return this.mood ? `${this.category.label} · ${this.mood.label}` : this.category.label;
  }

  /** DB에 저장할 태그 배열. */
  toTags() {
    return {
      genres: this.category ? [this.category.id] : [],
      themes: this.mood ? [this.mood.id] : [],
    };
  }

  /** 필터(카테고리·무드)에 맞는지. 빈 값은 "전체". */
  matches({ categoryKey = "", moodId = "" }) {
    if (categoryKey && this.categoryKey !== categoryKey) return false;
    if (moodId && this.mood?.id !== moodId) return false;
    return true;
  }
}
