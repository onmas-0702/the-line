// 편집 타임라인 마우스 모양 — 영상 편집 프로그램처럼 무엇을 끄는지 마우스 모양으로 알려 줍니다.
//   TRIM        — 두 조각 사이(경계): ][ 양쪽 화살표. 경계만 옮기고 두 조각을 합친 시간은 그대로.
//   RIPPLE_HEAD — 조각 앞 끝: [ 와 왼쪽 화살표. 이 조각 길이만 바뀌고 뒤 조각들이 따라 움직임.
//   RIPPLE_TAIL — 조각 뒤 끝: ] 와 오른쪽 화살표.
//   SLIP        — 트리밍 도구(T)로 조각 안: [◀▶] 조각 자리는 그대로, 안의 곡 위치만 옮김.
// 흰 테두리를 둘러 밝은 바탕·어두운 바탕 어디서나 보이게 그립니다.

export class EditCursor {
  static #stroke = 'stroke="white" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"';

  static #make(paths, fallback) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="24" viewBox="0 0 28 24"><g fill="#1c1917" ${EditCursor.#stroke}>${paths}</g></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 14 12, ${fallback}`;
  }

  /** 트리밍(두 조각 사이): ◀ ][ ▶ */
  static TRIM = EditCursor.#make(
    '<path d="M11 4h2v16h-2z M15 4h2v16h-2z M9 4h4v2h-4z M9 18h4v2h-4z M15 4h4v2h-4z M15 18h4v2h-4z"/>' +
      '<path d="M3 12 L8 8 L8 16 Z"/><path d="M25 12 L20 8 L20 16 Z"/>',
    "col-resize"
  );

  /** 롤링(조각 앞 끝): ◀ [ */
  static RIPPLE_HEAD = EditCursor.#make(
    '<path d="M15 4h2v16h-2z M15 4h5v2h-5z M15 18h5v2h-5z"/><path d="M4 12 L11 7 L11 17 Z"/>',
    "w-resize"
  );

  /** 롤링(조각 뒤 끝): ] ▶ */
  static RIPPLE_TAIL = EditCursor.#make(
    '<path d="M11 4h2v16h-2z M8 4h5v2h-5z M8 18h5v2h-5z"/><path d="M24 12 L17 7 L17 17 Z"/>',
    "e-resize"
  );

  /** 조각 안 트리밍(트리밍 도구): [ ◀▶ ] */
  static SLIP = EditCursor.#make(
    '<path d="M3 4h2v16h-2z M3 4h4v2h-4z M3 18h4v2h-4z M23 4h2v16h-2z M21 4h4v2h-4z M21 18h4v2h-4z"/>' +
      '<path d="M8 12 L13 8 L13 16 Z"/><path d="M20 12 L15 8 L15 16 Z"/>',
    "ew-resize"
  );
}
