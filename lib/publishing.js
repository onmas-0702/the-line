// 콘텐츠 공개 시점 — "바로 공개" 또는 "예약 공개(날짜·시각)". audios.publish_at(0021)에 저장되고,
// 그 시각 전에는 DB 읽기 정책이 운영자에게만 보여줍니다. 화면(스튜디오)은 이 클래스로 고르고·보여주고·확인합니다.
// 시각은 한국 시간(Asia/Seoul)으로 보여줍니다. 서버·클라이언트 양쪽에서 씁니다.

export class PublishSchedule {
  static MIN_LEAD_MINUTES = 5; // 예약은 지금부터 최소 5분 뒤
  static TIME_ZONE = "Asia/Seoul";

  /** at: Date | null — null이면 "바로 공개" */
  constructor(at = null) {
    this.at = at instanceof Date && !Number.isNaN(at.getTime()) ? at : null;
    Object.freeze(this);
  }

  static now() {
    return new PublishSchedule(null);
  }

  static at(date) {
    return new PublishSchedule(date);
  }

  /** 기본 예약 시각 — 내일 저녁 9시(밤 묵상 시간). */
  static suggested(now = new Date()) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(21, 0, 0, 0);
    return new PublishSchedule(d);
  }

  /** 콘텐츠(AudioMapper 결과)가 지금 공개 상태인지. publishAt이 없으면(예전 데이터) 공개. */
  static isLive(item, now = Date.now()) {
    if (!item?.publishAt) return true;
    const t = Date.parse(item.publishAt);
    return Number.isNaN(t) || t <= now;
  }

  /** 아직 공개 전(예약 중)인 콘텐츠의 공개 시각, 아니면 null. */
  static pendingAt(item, now = Date.now()) {
    return PublishSchedule.isLive(item, now) ? null : new Date(item.publishAt);
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
    return this.at ? PublishSchedule.label(this.at) : "바로 공개";
  }

  /** <input type="datetime-local">의 값(브라우저 시간대 기준) ↔ Date */
  static toInputValue(date) {
    if (!date) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /** 고를 수 있는 가장 이른 예약 시각(입력칸의 min). */
  static earliestInputValue(now = new Date()) {
    return PublishSchedule.toInputValue(new Date(now.getTime() + PublishSchedule.MIN_LEAD_MINUTES * 60 * 1000));
  }

  static fromInputValue(value) {
    if (!value) return PublishSchedule.now();
    return new PublishSchedule(new Date(value));
  }
}
