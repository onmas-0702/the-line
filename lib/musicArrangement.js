// 배경음악 트랙 편집 — 배경음악을 "조각(클립)" 여러 개로 나눠 이어 붙입니다.
//   MusicPiece       — 조각 하나: 곡의 어디서부터(offsetSeconds) 얼마나(lengthSeconds) 틀지,
//                      앞 조각과 몇 초 겹쳐 디졸브할지(dissolveSeconds). 불변.
//   MusicArrangement — 조각들을 트랙 시작(startSeconds)부터 차례로 이어 붙인 배치. 복사·붙이기·자르기·
//                      삭제·디졸브·가장자리 트리밍이 모두 새 배치를 돌려줍니다(불변).
//
// 조각은 빈틈 없이 차례로 이어지고(앞 조각 끝 = 다음 조각 시작), 디졸브가 있으면 그만큼 겹칩니다.
// 겹치는 동안 앞 조각은 줄어들고 뒤 조각은 커집니다(같은 크기로 들리는 곡선, MusicArrangement.crossfade).
// 예전 저장본(조각 없이 "시작·곡 안 위치·끝"만 있던 배경음악, 곡이 짧으면 자동 반복)은
// fromLegacy가 같은 소리가 나는 조각들로 펼칩니다 — 처음 편집할 때 이 조각들로 바뀝니다.

export class MusicPiece {
  static MIN_SECONDS = 0.5;

  static #counter = 0;

  static nextId() {
    MusicPiece.#counter += 1;
    return `m${Date.now().toString(36)}${MusicPiece.#counter}`;
  }

  constructor({ id = MusicPiece.nextId(), offsetSeconds = 0, lengthSeconds = 0, dissolveSeconds = 0 } = {}) {
    this.id = String(id);
    this.offsetSeconds = Math.max(0, Number(offsetSeconds) || 0);
    this.lengthSeconds = Math.max(0, Number(lengthSeconds) || 0);
    this.dissolveSeconds = Math.max(0, Number(dissolveSeconds) || 0);
    Object.freeze(this);
  }

  with(patch) {
    return new MusicPiece({ ...this.toJSON(), ...patch });
  }

  /** 같은 내용의 새 조각(새 id, 디졸브 없음) — 복사·붙이기용. */
  copy() {
    return new MusicPiece({ offsetSeconds: this.offsetSeconds, lengthSeconds: this.lengthSeconds });
  }

  toJSON() {
    return {
      id: this.id,
      offsetSeconds: this.offsetSeconds,
      lengthSeconds: this.lengthSeconds,
      dissolveSeconds: this.dissolveSeconds,
    };
  }
}

export class MusicArrangement {
  #layout = null; // layout 계산 결과(불변이라 한 번만 계산)
  static FRAME_RATE = 30; // 디졸브 길이를 프레임으로 말할 때 기준(초당 30프레임)
  static DISSOLVE_SECONDS = 1 + 15 / MusicArrangement.FRAME_RATE; // 디졸브는 1초 15프레임(1.5초)으로 고정
  static DISSOLVE_LABEL = "1초 15프레임";
  static MIN_DISSOLVE_FRAMES = 5; // 손잡이로 줄일 때 가장 짧은 길이(프레임)
  static #DISSOLVE_PREFIX = "dissolve:";

  /** 디졸브 고르기 키 — 배경음악 선택(id 하나)으로 "조각"과 "디졸브(그 조각과 앞 조각 사이)"를 함께 다룹니다. */
  static dissolveKey(pieceId) {
    return `${MusicArrangement.#DISSOLVE_PREFIX}${pieceId}`;
  }

  /** 선택 키 풀기 → { kind: "piece" | "dissolve" | null, id } */
  static parseSelection(key) {
    if (!key) return { kind: null, id: null };
    const text = String(key);
    if (text.startsWith(MusicArrangement.#DISSOLVE_PREFIX)) {
      return { kind: "dissolve", id: text.slice(MusicArrangement.#DISSOLVE_PREFIX.length) };
    }
    return { kind: "piece", id: text };
  }

  /** 초 → 프레임 단위로 맞춘 초(초당 FRAME_RATE). */
  static snapToFrame(seconds) {
    return Math.round(seconds * MusicArrangement.FRAME_RATE) / MusicArrangement.FRAME_RATE;
  }

  /** 초 → "1초 15프레임" 같은 표시. */
  static frameLabel(seconds) {
    const frames = Math.round(Math.max(0, seconds) * MusicArrangement.FRAME_RATE);
    const whole = Math.floor(frames / MusicArrangement.FRAME_RATE);
    const rest = frames % MusicArrangement.FRAME_RATE;
    if (!whole) return `${rest}프레임`;
    return rest ? `${whole}초 ${rest}프레임` : `${whole}초`;
  }
  static EDGE_GUARD = 0.2; // 자르기는 조각 끝에서 이만큼 안쪽에서만

  constructor({ startSeconds = 0, pieces = [] } = {}) {
    this.startSeconds = Math.max(0, Number(startSeconds) || 0);
    this.pieces = Object.freeze(
      pieces
        .map((p) => (p instanceof MusicPiece ? p : new MusicPiece(p)))
        .filter((p) => p.lengthSeconds > 0)
        .map((p, i, list) => (i === 0 ? (p.dissolveSeconds ? p.with({ dissolveSeconds: 0 }) : p) : MusicArrangement.#clampDissolve(p, list[i - 1])))
    );
    Object.freeze(this);
  }

  /** 예전 배경음악(시작·곡 안 위치·끝, 짧으면 반복) → 같은 소리가 나는 조각들. 반복되는 곳마다 조각이 나뉩니다. */
  static fromLegacy({ startSeconds, offsetSeconds, endSeconds, songSeconds }) {
    const pieces = [];
    if (songSeconds > 0) {
      let remaining = Math.max(0, endSeconds - startSeconds);
      let offset = ((offsetSeconds % songSeconds) + songSeconds) % songSeconds;
      let i = 0;
      while (remaining > 0.001 && i < 500) {
        const length = Math.min(remaining, songSeconds - offset);
        pieces.push(new MusicPiece({ id: `auto-${i}`, offsetSeconds: offset, lengthSeconds: length }));
        remaining -= length;
        offset = 0;
        i += 1;
      }
    }
    return new MusicArrangement({ startSeconds, pieces });
  }

  /** 조각마다 타임라인 위치 — [{ piece, index, start, end, fadeIn, fadeOut }] */
  get layout() {
    if (this.#layout) return this.#layout;
    const out = [];
    let cursor = this.startSeconds;
    this.pieces.forEach((piece, index) => {
      const start = index === 0 ? cursor : cursor - piece.dissolveSeconds;
      const end = start + piece.lengthSeconds;
      out.push({ piece, index, start, end, fadeIn: index === 0 ? 0 : piece.dissolveSeconds, fadeOut: 0 });
      cursor = end;
    });
    for (let i = 0; i < out.length - 1; i++) out[i].fadeOut = out[i + 1].fadeIn;
    this.#layout = Object.freeze(out.map((entry) => Object.freeze(entry)));
    return this.#layout;
  }

  get endSeconds() {
    const layout = this.layout;
    return layout.length ? layout[layout.length - 1].end : this.startSeconds;
  }

  get isEmpty() {
    return this.pieces.length === 0;
  }

  find(id) {
    return this.pieces.find((p) => p.id === id) || null;
  }

  indexOf(id) {
    return this.pieces.findIndex((p) => p.id === id);
  }

  /** seconds에 걸쳐 있는 조각(디졸브로 겹치면 뒤 조각). */
  pieceAt(seconds) {
    const layout = this.layout;
    for (let i = layout.length - 1; i >= 0; i--) {
      if (seconds >= layout[i].start && seconds < layout[i].end) return layout[i];
    }
    return null;
  }

  /** seconds에서 자를 수 있는지 — 조각 안쪽이고 양 끝에서 조금 떨어져 있어야 합니다. */
  canSplitAt(seconds) {
    const hit = this.pieceAt(seconds);
    if (!hit) return false;
    const guard = Math.max(MusicArrangement.EDGE_GUARD, hit.fadeIn, hit.fadeOut);
    return seconds - hit.start > guard && hit.end - seconds > guard;
  }

  /** seconds에서 조각을 둘로 자릅니다(재생선 자르기). */
  splitAt(seconds) {
    if (!this.canSplitAt(seconds)) return this;
    const { piece, index, start } = this.pieceAt(seconds);
    const head = seconds - start;
    const left = piece.with({ lengthSeconds: head });
    const right = new MusicPiece({ offsetSeconds: piece.offsetSeconds + head, lengthSeconds: piece.lengthSeconds - head });
    return this.#replace(index, 1, [left, right]);
  }

  /** 조각 지우기 — 뒤 조각들이 당겨집니다. 마지막 하나는 지우지 않습니다. */
  remove(id) {
    const index = this.indexOf(id);
    if (index < 0 || this.pieces.length <= 1) return this;
    return this.#replace(index, 1, []);
  }

  /** piece(복사해 둔 조각)의 복사본을 afterId 조각 바로 뒤에(없으면 맨 뒤에) 끼워 넣습니다. 뒤 조각들은 밀립니다. */
  paste(piece, afterId = null) {
    const index = afterId ? this.indexOf(afterId) : -1;
    const at = index >= 0 ? index + 1 : this.pieces.length;
    return this.#replace(at, 0, [piece.copy()]);
  }

  /** 붙여 넣은 조각의 id(paste 직후 고르기용). */
  static pastedId(before, after) {
    const ids = new Set(before.pieces.map((p) => p.id));
    return after.pieces.find((p) => !ids.has(p.id))?.id || null;
  }

  /** id 조각과 그 앞 조각을 seconds초 디졸브로 잇습니다(0이면 디졸브 없이 바로 이어짐). */
  setDissolve(id, seconds) {
    const index = this.indexOf(id);
    if (index <= 0) return this;
    return this.#replace(index, 1, [this.pieces[index].with({ dissolveSeconds: seconds })]);
  }

  /** 고정 길이(1초 15프레임) 디졸브를 켜거나 끕니다. */
  toggleDissolve(id) {
    const piece = this.find(id);
    if (!piece) return this;
    return this.setDissolve(id, piece.dissolveSeconds > 0 ? 0 : MusicArrangement.DISSOLVE_SECONDS);
  }

  /** 디졸브 길이 바꾸기(손잡이 끌기) — 프레임에 맞추고, 최소 길이와 두 조각이 허락하는 최대 길이 사이로. */
  resizeDissolve(id, seconds) {
    const index = this.indexOf(id);
    if (index <= 0) return this;
    const min = MusicArrangement.MIN_DISSOLVE_FRAMES / MusicArrangement.FRAME_RATE;
    const max = Math.floor(this.maxDissolve(id) * MusicArrangement.FRAME_RATE) / MusicArrangement.FRAME_RATE;
    if (max < min) return this;
    return this.setDissolve(id, Math.max(min, Math.min(max, MusicArrangement.snapToFrame(seconds))));
  }

  /** 디졸브 손잡이 끌기 — 끈 손잡이가 마우스를 따라가고 나머지 타임라인은 제자리에 둡니다.
   *  edge "end"(뒤 손잡이 = 앞 조각의 끝): 앞 조각 끝을 늘이거나 줄이며 디졸브도 같은 만큼.
   *  edge "start"(앞 손잡이 = 뒤 조각의 시작): 뒤 조각 앞부분을 되살리거나 잘라 내며 디졸브도 같은 만큼.
   *  곡에 남은 부분이 모자라면 그만큼은 뒤 조각들이 당겨지는 방식으로 늘어납니다. deltaSeconds: 마우스가 움직인 초(오른쪽 +). */
  resizeDissolveFrom(id, edge, deltaSeconds, songSeconds) {
    const index = this.indexOf(id);
    if (index <= 0) return this;
    const prev = this.pieces[index - 1];
    const piece = this.pieces[index];
    const rate = MusicArrangement.FRAME_RATE;
    const minFrames = MusicArrangement.MIN_DISSOLVE_FRAMES;
    const fromFrames = Math.round(piece.dissolveSeconds * rate);
    const grow = Math.round((edge === "start" ? -deltaSeconds : deltaSeconds) * rate);
    // 디졸브 길이(프레임) → 두 조각의 새 모양. 늘린 만큼 곡의 남은 부분(손잡이 쪽)을 씁니다.
    const shapeFor = (frames) => {
      const change = (frames - fromFrames) / rate;
      if (edge === "end") {
        const room = songSeconds > 0 ? Math.max(0, songSeconds - (prev.offsetSeconds + prev.lengthSeconds)) : 0;
        return { prevLength: prev.lengthSeconds + Math.min(change, room), pieceOffset: piece.offsetSeconds, pieceLength: piece.lengthSeconds };
      }
      const used = Math.min(change, piece.offsetSeconds);
      return { prevLength: prev.lengthSeconds, pieceOffset: piece.offsetSeconds - used, pieceLength: piece.lengthSeconds + used };
    };
    const fits = (frames, shape) => frames / rate <= Math.min(shape.prevLength, shape.pieceLength) / 2 + 1e-9;
    let frames = Math.max(minFrames, fromFrames + grow);
    let shape = shapeFor(frames);
    while (frames > minFrames && !fits(frames, shape)) {
      frames -= 1;
      shape = shapeFor(frames);
    }
    if (!fits(frames, shape)) return this;
    const pieces = [...this.pieces];
    pieces[index - 1] = prev.with({ lengthSeconds: shape.prevLength });
    pieces[index] = piece.with({ offsetSeconds: shape.pieceOffset, lengthSeconds: shape.pieceLength, dissolveSeconds: frames / rate });
    return new MusicArrangement({ startSeconds: this.startSeconds, pieces });
  }

  /** 트리밍 — id 조각과 그 앞 조각 사이의 경계를 옮깁니다. 앞 조각이 늘면 뒤 조각이 그만큼 줄어서
   *  두 조각을 합친 시간과 나머지 타임라인은 그대로입니다(디졸브가 있으면 디졸브째 옮겨짐).
   *  deltaSeconds: 경계가 움직인 초(오른쪽 +). 곡 길이·조각 최소 길이 안에서 멈춥니다. */
  rollAt(id, deltaSeconds, songSeconds) {
    const index = this.indexOf(id);
    if (index <= 0) return this;
    const prev = this.pieces[index - 1];
    const piece = this.pieces[index];
    const minPrev = Math.max(MusicPiece.MIN_SECONDS, piece.dissolveSeconds + 0.1);
    const minPiece = Math.max(MusicPiece.MIN_SECONDS, piece.dissolveSeconds + 0.1);
    const prevRoom = songSeconds > 0 ? songSeconds - (prev.offsetSeconds + prev.lengthSeconds) : 0;
    const high = Math.min(prevRoom, piece.lengthSeconds - minPiece); // 오른쪽으로 갈 수 있는 만큼
    const low = -Math.min(piece.offsetSeconds, prev.lengthSeconds - minPrev); // 왼쪽으로 갈 수 있는 만큼
    const delta = Math.max(Math.min(0, low), Math.min(Math.max(0, high), deltaSeconds));
    if (!delta) return this;
    const pieces = [...this.pieces];
    pieces[index - 1] = prev.with({ lengthSeconds: prev.lengthSeconds + delta });
    pieces[index] = piece.with({ offsetSeconds: piece.offsetSeconds + delta, lengthSeconds: piece.lengthSeconds - delta });
    return new MusicArrangement({ startSeconds: this.startSeconds, pieces });
  }

  /** 조각 안 트리밍 — 조각의 자리와 길이는 그대로 두고, 그 안에서 들리는 곡의 위치만 옮깁니다.
   *  오른쪽(+)으로 끌면 곡이 오른쪽으로 밀려 더 앞부분이 들립니다. 곡의 처음·끝을 넘지 않습니다. */
  slipAt(id, deltaSeconds, songSeconds) {
    const index = this.indexOf(id);
    if (index < 0 || !(songSeconds > 0)) return this;
    const piece = this.pieces[index];
    const maxOffset = Math.max(0, songSeconds - piece.lengthSeconds);
    const offset = Math.max(0, Math.min(maxOffset, piece.offsetSeconds - deltaSeconds));
    if (offset === piece.offsetSeconds) return this;
    return this.#replace(index, 1, [piece.with({ offsetSeconds: offset })]);
  }

  /** 타임라인에서 끄는 편집 하나를 적용 — kind "trim": 두 조각 사이 경계 옮기기(rollAt),
   *  "slip": 조각 안 트리밍(slipAt), "dissolve": 디졸브 손잡이(resizeDissolveFrom). */
  applyDrag({ kind, id, edge }, deltaSeconds, songSeconds) {
    if (kind === "trim") return this.rollAt(id, deltaSeconds, songSeconds);
    if (kind === "slip") return this.slipAt(id, deltaSeconds, songSeconds);
    return this.resizeDissolveFrom(id, edge, deltaSeconds, songSeconds);
  }

  /** 고정 디졸브를 넣을 수 있는지 — 앞 조각이 있고 두 조각이 충분히 길어야 합니다. */
  canDissolve(id) {
    return this.indexOf(id) > 0 && this.maxDissolve(id) + 0.001 >= MusicArrangement.DISSOLVE_SECONDS;
  }

  /** 디졸브로 줄 수 있는 최대 길이 — 두 조각 중 짧은 쪽의 절반 정도까지. */
  maxDissolve(id) {
    const index = this.indexOf(id);
    if (index <= 0) return 0;
    return MusicArrangement.#dissolveLimit(this.pieces[index - 1], this.pieces[index]);
  }

  /** 조각 가장자리 끌기 — edge "start": 앞부분을 잘라 내거나 되살림(곡 안 위치가 함께 움직임),
   *  edge "end": 뒷부분. 첫 조각의 앞 끝은 트랙 시작도 함께 움직여서 소리가 제자리에 남습니다. 곡 길이를 넘지 않습니다. */
  trim(id, edge, deltaSeconds, songSeconds) {
    const index = this.indexOf(id);
    if (index < 0) return this;
    const piece = this.pieces[index];
    const min = Math.max(MusicPiece.MIN_SECONDS, piece.dissolveSeconds + 0.1);
    if (edge === "end") {
      const maxLength = songSeconds > 0 ? songSeconds - piece.offsetSeconds : piece.lengthSeconds;
      const length = Math.max(min, Math.min(maxLength, piece.lengthSeconds + deltaSeconds));
      return this.#replace(index, 1, [piece.with({ lengthSeconds: length })]);
    }
    // 앞 끝: 오른쪽(+)으로 끌면 앞부분이 잘림. 곡의 처음보다 앞으로는 못 감.
    let delta = Math.max(-piece.offsetSeconds, Math.min(piece.lengthSeconds - min, deltaSeconds));
    if (index === 0) delta = Math.max(delta, -this.startSeconds);
    const next = piece.with({ offsetSeconds: piece.offsetSeconds + delta, lengthSeconds: piece.lengthSeconds - delta });
    const moved = this.#replace(index, 1, [next]);
    return index === 0 ? new MusicArrangement({ startSeconds: this.startSeconds + delta, pieces: moved.pieces }) : moved;
  }

  /** 트랙 전체를 옮깁니다(시작 위치). */
  withStart(startSeconds) {
    return new MusicArrangement({ startSeconds, pieces: this.pieces });
  }

  /** 디졸브 구간에서 앞·뒤 조각의 볼륨 — x: 0(디졸브 시작)~1(끝). 같은 크기로 들리는 곡선. */
  static crossfade(x) {
    const t = Math.max(0, Math.min(1, x));
    return { fadingOut: Math.cos((t * Math.PI) / 2), fadingIn: Math.sin((t * Math.PI) / 2) };
  }

  /** 조각 하나의 seconds 시점 볼륨 배율(디졸브 반영, 0~1). */
  static pieceGain(entry, seconds) {
    if (seconds < entry.start || seconds >= entry.end) return 0;
    let gain = 1;
    if (entry.fadeIn > 0 && seconds < entry.start + entry.fadeIn) {
      gain *= MusicArrangement.crossfade((seconds - entry.start) / entry.fadeIn).fadingIn;
    }
    if (entry.fadeOut > 0 && seconds > entry.end - entry.fadeOut) {
      gain *= MusicArrangement.crossfade((seconds - (entry.end - entry.fadeOut)) / entry.fadeOut).fadingOut;
    }
    return gain;
  }

  /** 편집 타임라인 파형 막대 하나의 모양 — 곡의 모양(peak 12~100)이 잘 보이도록 높이를 넉넉히 쓰고,
   *  트랙 볼륨(volumeFraction: 0=−100% 무음, 0.5=0% 원래 크기, 1=+100%)과 디졸브는 높이로,
   *  시간별 볼륨(줄이기·페이드)은 진하기로 보여 줍니다. → { heightPercent, opacity } */
  static waveBar(peak, level, dissolveGain, volumeFraction = 0.5) {
    const shape = Math.max(0, Math.min(1, (peak - 12) / 88));
    const loudness = Math.max(0, Math.min(1, volumeFraction));
    const heightPercent = (12 + 84 * shape) * loudness * Math.max(0.15, dissolveGain);
    const opacity = 0.4 + 0.6 * Math.max(0, Math.min(1, level));
    return { heightPercent, opacity };
  }

  toJSON() {
    return this.pieces.map((p) => p.toJSON());
  }

  #replace(index, count, items) {
    const pieces = [...this.pieces];
    pieces.splice(index, count, ...items);
    return new MusicArrangement({ startSeconds: this.startSeconds, pieces });
  }

  static #dissolveLimit(prev, piece) {
    return Math.max(0, Math.min(prev.lengthSeconds, piece.lengthSeconds) / 2);
  }

  static #clampDissolve(piece, prev) {
    const max = MusicArrangement.#dissolveLimit(prev, piece);
    return piece.dissolveSeconds > max ? piece.with({ dissolveSeconds: Math.floor(max * 10) / 10 }) : piece;
  }
}
