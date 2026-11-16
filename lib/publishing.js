// 콘텐츠 공개 상태 — "바로 공개" · "예약 공개(날짜·시각)" · "비공개".
// 공개 시각은 audios.publish_at(0021), 비공개는 audios.is_private(0023)에 저장되고,
// 공개 시각 전이거나 비공개면 DB 읽기 정책이 운영자에게만 보여줍니다. 화면(스튜디오)은 이 클래스로 고르고·보여주고·확인합니다.
// 시각은 한국 시간(Asia/Seoul)으로 보여줍니다. 서버·클라이언트 양쪽에서 씁니다.

export class PublishSchedule {
  static MIN_LEAD_MINUTES = 5; // 예약은 지금부터 최소 5분 뒤
  static TIME_ZONE = "Asia/Seoul";

  /** 공개 상태 이름 — 목록의 표시와 고르기에 씁니다. */
  static State = Object.freeze({ PUBLIC: "public", SCHEDULED: "scheduled", PRIVATE: "private" });

  /** at: Date | null — null이면 "바로 공개". isPrivate면 비공개(at은 무시). */
  constructor(at = null, { isPrivate = false } = {}) {
    this.isPrivate = Boolean(isPrivate);
    this.at = !this.isPrivate && at instanceof Date && !Number.isNaN(at.getTime()) ? at : null;
    Object.freeze(this);
  }

  static now() {
    return new PublishSchedule(null);
  }

  static private() {
    return new PublishSchedule(null, { isPrivate: true });
  }

  /** 콘텐츠의 지금 상태를 고르기 값으로 — 비공개 / 예약(그 시각) / 공개. */
  static forItem(item, now = Date.now()) {
    if (item?.isPrivate) return PublishSchedule.private();
    const pending = PublishSchedule.pendingAt(item, now);
    return pending ? PublishSchedule.at(pending) : PublishSchedule.now();
  }

  /** 콘텐츠의 공개 상태 이름(State). */
  static stateOf(item, now = Date.now()) {
    return PublishSchedule.forItem(item, now).state;
  }

  get state() {
    if (this.isPrivate) return PublishSchedule.State.PRIVATE;
    return this.isScheduled ? PublishSchedule.State.SCHEDULED : PublishSchedule.State.PUBLIC;
  }

  /** 같은 상태(같은 예약 시각)인지 — 바뀌었는지 볼 때. */
  equals(other) {
    return Boolean(other) && this.state === other.state && this.toColumn() === other.toColumn();
  }

  static at(date) {
    return new PublishSchedule(date);
  }

  /** 기본 예약 시각 — 한국 시간으로 내일 저녁 9시(밤 묵상 시간). */
  static suggested(now = new Date()) {
    const tonight = PublishSchedule.#fromParts(PublishSchedule.dateValueOf(now), 21 * 60);
    return new PublishSchedule(new Date(tonight.getTime() + 24 * 60 * 60 * 1000));
  }

  /** 콘텐츠(AudioMapper 결과)가 지금 공개 상태인지. publishAt이 없으면(예전 데이터) 공개. */
  static isLive(item, now = Date.now()) {
    if (item?.isPrivate) return false;
    if (!item?.publishAt) return true;
    const t = Date.parse(item.publishAt);
    return Number.isNaN(t) || t <= now;
  }

  /** 아직 공개 전(예약 중)인 콘텐츠의 공개 시각, 아니면 null. */
  static pendingAt(item, now = Date.now()) {
    if (item?.isPrivate || !item?.publishAt) return null;
    const t = Date.parse(item.publishAt);
    return Number.isNaN(t) || t <= now ? null : new Date(t);
  }

  get isScheduled() {
    return this.at !== null;
  }

  /** 예약이면 확인 문제를 돌려줍니다(없으면 ""). */
  problem(now = new Date()) {
    if (!this.isScheduled) return "";
    const min = now.getTime() + PublishSchedule.MIN_LEAD_MINUTES * 60 * 1000;
    if (this.at.getTime() < min) return `예약 시각은 지금부터 ${PublishSchedule.MIN_LEAD_MINUTES}분 뒤 이후로 골라주세요.`;
    return "";
  }

  /** DB에 넣을 값 — 예약이면 ISO 시각, 바로 공개면 null(DB 기본값 now()). */
  toColumn() {
    return this.at ? this.at.toISOString() : null;
  }

  /** 11월 20일 (목) 오후 9:00 */
  static label(date) {
    if (!date) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: PublishSchedule.TIME_ZONE,
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  get label() {
    if (this.isPrivate) return "비공개";
    return this.at ? PublishSchedule.label(this.at) : "바로 공개";
  }

  // ── 날짜·시각 따로 고르기(스튜디오 예약 공개) — 모두 한국 시간 기준 ──
  // 한국은 서머타임이 없어 늘 UTC+9입니다. 보는 사람의 컴퓨터 시간대와 상관없이 한국 시간으로 고릅니다.
  static TIME_STEP_MINUTES = 15;
  static #OFFSET_MS = 9 * 60 * 60 * 1000;

  static #partsOf(date) {
    const s = new Date(date.getTime() + PublishSchedule.#OFFSET_MS);
    const pad = (n) => String(n).padStart(2, "0");
    return {
      dateValue: `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`,
      minutes: s.getUTCHours() * 60 + s.getUTCMinutes(),
    };
  }

  /** "2026-11-17" + 하루 중 분(0~1439) → Date */
  static #fromParts(dateValue, minutes) {
    const [y, m, d] = dateValue.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, minutes) - PublishSchedule.#OFFSET_MS);
  }

  /** 한국 날짜 "YYYY-MM-DD" — 날짜 입력칸의 값·min으로 씁니다. */
  static dateValueOf(date = new Date()) {
    return PublishSchedule.#partsOf(date).dateValue;
  }

  get dateValue() {
    return PublishSchedule.dateValueOf(this.at ?? new Date());
  }

  get minutesOfDay() {
    return PublishSchedule.#partsOf(this.at ?? new Date()).minutes;
  }

  /** 날짜만 바꾼 새 값(시각은 그대로). */
  withDate(dateValue) {
    if (!dateValue) return this;
    return new PublishSchedule(PublishSchedule.#fromParts(dateValue, this.minutesOfDay));
  }

  /** 시각만 바꾼 새 값(날짜는 그대로). */
  withTime(minutes) {
    return new PublishSchedule(PublishSchedule.#fromParts(this.dateValue, minutes));
  }

  /** 고를 수 있는 시각들(15분 간격, 하루 96칸). */
  static timeSlots() {
    const count = (24 * 60) / PublishSchedule.TIME_STEP_MINUTES;
    return Array.from({ length: count }, (_, i) => i * PublishSchedule.TIME_STEP_MINUTES);
  }

  /** 분 → "오후 9:00" */
  static timeLabel(minutes) {
    return new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(
      new Date(Date.UTC(2000, 0, 1, 0, minutes)),
    );
  }

  /** "2026-11-17" → "2026년 11월 17일 (화)" */
  static dateLabel(dateValue) {
    const [y, m, d] = dateValue.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const weekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", weekday: "short" }).format(date);
    return `${y}년 ${m}월 ${d}일 (${weekday})`;
  }

  /** 지금 고른 날짜에서 그 시각이 너무 이른지(지나갔거나 5분 안쪽) — 목록에서 흐리게 보여 줍니다. */
  isTooEarly(minutes, now = new Date()) {
    const at = PublishSchedule.#fromParts(this.dateValue, minutes);
    return at.getTime() < now.getTime() + PublishSchedule.MIN_LEAD_MINUTES * 60 * 1000;
  }
}
