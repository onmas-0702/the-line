// 파일 끌어다 놓기(드래그 앤 드롭) — 탐색기/Finder에서 끌어 온 파일을 꺼내고 종류를 거릅니다.
//   FileKind — 받을 파일 종류(오디오·원고)와 <input accept> 값, 확장자 확인
//   FileDrop — 드래그 이벤트에 파일이 실려 있는지, 실린 파일 중 받을 수 있는 것만 꺼내기
// 화면은 components/common/FileDropZone.js가 이 클래스를 씁니다.

export class FileKind {
  constructor({ label, accept, mimePrefix = "", extensions = [] }) {
    this.label = label;
    this.accept = accept; // <input type="file" accept>
    this.mimePrefix = mimePrefix;
    this.extensions = extensions;
    Object.freeze(this);
  }

  static AUDIO = new FileKind({
    label: "오디오 파일",
    accept: "audio/*,.mp3,.m4a,.wav,.aac,.ogg",
    mimePrefix: "audio/",
    extensions: ["mp3", "m4a", "wav", "aac", "ogg"],
  });

  static SCRIPT = new FileKind({
    label: "원고 파일",
    accept: ".txt,.doc,.docx,.pdf,.hwp,.hwpx,.md,text/plain,application/pdf",
    extensions: ["txt", "doc", "docx", "pdf", "hwp", "hwpx", "md"],
  });

  matches(file) {
    if (!file) return false;
    if (this.mimePrefix && (file.type || "").startsWith(this.mimePrefix)) return true;
    const ext = (file.name || "").split(".").pop()?.toLowerCase() || "";
    return this.extensions.includes(ext);
  }
}

export class FileDrop {
  /** 드래그 중인 것이 파일인지(클립 순서 바꾸기 같은 화면 안 드래그와 구분). */
  static carriesFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  /** 놓은 파일을 받을 수 있는 것(accepted)과 아닌 것(rejected)으로 나눕니다. */
  static split(fileList, kind) {
    const files = Array.from(fileList || []);
    if (!kind) return { accepted: files, rejected: [] };
    return {
      accepted: files.filter((f) => kind.matches(f)),
      rejected: files.filter((f) => !kind.matches(f)),
    };
  }
}
