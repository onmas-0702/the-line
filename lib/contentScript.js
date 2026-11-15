// 콘텐츠 대본 — 제작·수정 화면의 "대본 첨부"와 채널 목록의 "대본 받기"가 함께 씁니다.
//   ScriptChoice   — 대본을 그대로 둘지 / 새 파일로 바꿀지 / 뺄지. 불변(바꾸면 새 인스턴스).
//   ScriptDownload — 저장된 대본을 원래 파일 이름으로 내려받는 주소.

export class ScriptChoice {
  static KEEP = "keep";
  static REPLACE = "replace";
  static REMOVE = "remove";

  constructor({ mode = ScriptChoice.KEEP, file = null, currentName = "" } = {}) {
    this.mode = mode;
    this.file = file; // REPLACE일 때의 새 파일
    this.currentName = currentName; // 이미 저장된 대본 이름("" = 없음)
    Object.freeze(this);
  }

  /** 저장된 콘텐츠의 지금 대본으로 시작(새로 만들 때는 item 없이). */
  static of(item = null) {
    return new ScriptChoice({ currentName: item?.scriptUrl ? item.scriptFileName || "대본" : "" });
  }

  withFile(file) {
    return new ScriptChoice({ mode: ScriptChoice.REPLACE, file, currentName: this.currentName });
  }

  /** 새로 고른 파일 취소·빼기 취소는 원래대로, 원래 대본만 있으면 빼기. */
  cleared() {
    if (this.mode !== ScriptChoice.KEEP || !this.currentName) {
      return new ScriptChoice({ currentName: this.currentName });
    }
    return new ScriptChoice({ mode: ScriptChoice.REMOVE, currentName: this.currentName });
  }

  get isChanged() {
    return this.mode !== ScriptChoice.KEEP;
  }

  /** 화면에 보여 줄 대본 이름("" = 대본 없음). */
  get shownName() {
    if (this.mode === ScriptChoice.REPLACE) return this.file?.name || "";
    if (this.mode === ScriptChoice.REMOVE) return "";
    return this.currentName;
  }

  /** 저장할 때 넘길 파일(빼기는 null). */
  get fileToSave() {
    return this.mode === ScriptChoice.REPLACE ? this.file : null;
  }
}

export class ScriptDownload {
  /** Supabase 공개 주소에 ?download=이름 을 붙이면 브라우저가 그 이름으로 내려받습니다. */
  static url(item) {
    if (!item?.scriptUrl) return null;
    const name = item.scriptFileName || "대본";
    const joiner = item.scriptUrl.includes("?") ? "&" : "?";
    return `${item.scriptUrl}${joiner}download=${encodeURIComponent(name)}`;
  }
}
