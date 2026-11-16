"use client";

// 구독자 알림 — 새 콘텐츠가 공개되면 알려줍니다(0021_scheduled_publish_notifications.sql).
//   NotificationInbox          — 최근 공개된 콘텐츠 + 마지막으로 본 시각 → 새 알림 개수·표시(불변)
//   NotificationRepository     — 최근 공개 콘텐츠 불러오기, 마지막으로 본 시각 읽기·저장
//   PushSubscriptionRepository — "휴대폰 알림 받기"를 켠 기기 저장·삭제
//   WebPushDevice              — 이 브라우저의 푸시 알림 지원 여부·권한·켜기·끄기(service worker /sw.js)
//   DispatchTrigger            — 예약 시각이 지난 콘텐츠의 푸시 알림 발송을 가끔 깨워 줌(/api/notifications/dispatch)
//
// 앱 안 알림(종 모양·마이 페이지 "알림")은 따로 보내는 작업 없이 "공개 시각 > 마지막으로 본 시각"으로
// 계산하므로 예약 시각이 되는 순간부터 정확히 보입니다. 휴대폰 푸시는 서버가 보내야 해서 별도 발송이 필요합니다.

import { Channel, ChannelSlug } from "@/lib/channel";
import { SupabaseRepository } from "@/lib/supabaseRepository";

export class NotificationInbox {
  /** 알림을 처음 여는 사람에게는 최근 이만큼(일)의 콘텐츠를 새 알림으로 보여줍니다. */
  static FIRST_VISIT_DAYS = 7;

  /** items: [{ id, title, publishAt, href, channelName }] (최신순), lastSeenAt: Date | null */
  constructor(items = [], lastSeenAt = null) {
    this.items = items;
    this.lastSeenAt = lastSeenAt;
    Object.freeze(this);
  }

  static empty() {
    return new NotificationInbox();
  }

  #threshold() {
    if (this.lastSeenAt) return this.lastSeenAt.getTime();
    return Date.now() - NotificationInbox.FIRST_VISIT_DAYS * 24 * 60 * 60 * 1000;
  }

  isUnread(item) {
    return Date.parse(item.publishAt) > this.#threshold();
  }

  get unreadCount() {
    return this.items.filter((item) => this.isUnread(item)).length;
  }

  /** 다 읽음으로 바꾼 새 받은편지함(화면의 "새" 표시는 지금 보고 있는 동안은 그대로 두려면 쓰지 않음). */
  markedSeen(at = new Date()) {
    return new NotificationInbox(this.items, at);
  }

  /** 종 모양 배지 글자 — 10개 넘으면 9+. */
  get badge() {
    const n = this.unreadCount;
    return n > 9 ? "9+" : n > 0 ? String(n) : "";
  }
}

/** 플랫폼 전체(채널 구분 없음) — 마이 페이지·상단 종 모양에서 씁니다. */
export class NotificationRepository extends SupabaseRepository {
  static LIMIT = 30;

  /** 공개 시각이 지난 최근 콘텐츠(DB 정책이 예약 중인 것은 운영자에게만 주므로 여기서도 한 번 더 거릅니다). */
  async recent({ limit = NotificationRepository.LIMIT } = {}) {
    if (!this.configured) return this.notConfigured({ items: [] });
    const nowIso = new Date().toISOString();
    // 비공개(0023)는 운영자에게도 알림으로 보이지 않게 거릅니다. 0023 전 DB면 그 조건 없이 다시 읽습니다.
    const query = (hidePrivate) => {
      let q = this.client
        .from("audios")
        .select("id, title, publish_at, created_at, channel_id, channels(slug, name)")
        .lte("publish_at", nowIso);
      if (hidePrivate) q = q.eq("is_private", false);
      return q.order("publish_at", { ascending: false }).limit(limit);
    };
    let { data, error } = await query(true);
    if (error && /is_private/.test(error.message)) ({ data, error } = await query(false));
    if (error) return SupabaseRepository.fail(error.message, { items: [] });
    const items = (data || []).map((row) => ({
      id: row.id,
      title: row.title || "제목 없는 나눔",
      publishAt: row.publish_at || row.created_at,
      channelName: row.channels?.name || "",
      href: Channel.contentHref(row.channels?.slug || ChannelSlug.DEFAULT, row.id),
    }));
    return SupabaseRepository.ok({ items });
  }

  async lastSeen(userId) {
    if (!this.configured || !userId) return this.notConfigured({ at: null });
    const { data, error } = await this.client
      .from("notification_reads")
      .select("last_seen_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return SupabaseRepository.fail(error.message, { at: null });
    return SupabaseRepository.ok({ at: data?.last_seen_at ? new Date(data.last_seen_at) : null });
  }

  /** 받은편지함(최근 콘텐츠 + 마지막으로 본 시각)을 한 번에. */
  async inbox(userId) {
    const [recent, seen] = await Promise.all([this.recent(), this.lastSeen(userId)]);
    if (!recent.ok) return { ...recent, inbox: NotificationInbox.empty() };
    return SupabaseRepository.ok({ inbox: new NotificationInbox(recent.items, seen.at) });
  }

  async markSeen(userId, at = new Date()) {
    if (!this.configured || !userId) return this.notConfigured();
    const { error } = await this.client
      .from("notification_reads")
      .upsert({ user_id: userId, last_seen_at: at.toISOString() }, { onConflict: "user_id" });
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }
}

export class PushSubscriptionRepository extends SupabaseRepository {
  static TABLE = "push_subscriptions";

  /** subscription: PushSubscription.toJSON() — 같은 기기(endpoint)는 한 행만. */
  async save(userId, subscription, userAgent = "") {
    if (!this.configured) return this.notConfigured();
    const { endpoint, keys = {} } = subscription || {};
    if (!endpoint || !keys.p256dh || !keys.auth) return SupabaseRepository.fail("알림 정보가 올바르지 않아요.");
    const { error } = await this.client.from(PushSubscriptionRepository.TABLE).upsert(
      { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent.slice(0, 300) },
      { onConflict: "endpoint" }
    );
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  async remove(endpoint) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.from(PushSubscriptionRepository.TABLE).delete().eq("endpoint", endpoint);
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }
}

/** 이 브라우저(기기)의 푸시 알림. 아이폰은 iOS 16.4 이상에서 "홈 화면에 추가"한 앱으로 열었을 때만 됩니다. */
export class WebPushDevice {
  static SERVICE_WORKER = "/sw.js";
  static VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

  static State = Object.freeze({
    UNCONFIGURED: "unconfigured", // 서버에 알림 키가 아직 없음
    UNSUPPORTED: "unsupported", // 이 브라우저는 푸시를 못 받음
    NEEDS_INSTALL: "needs-install", // 아이폰 — 홈 화면에 추가한 앱으로 열어야 함
    DENIED: "denied", // 알림을 차단함(브라우저 설정에서 풀어야 함)
    OFF: "off",
    ON: "on",
  });

  static get isSupported() {
    return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  static get #isIOS() {
    return typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
  }

  static get #isStandalone() {
    return typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);
  }

  static async #registration() {
    return navigator.serviceWorker.register(WebPushDevice.SERVICE_WORKER, { scope: "/" });
  }

  /** 지금 상태와(켜져 있으면) 구독 정보. */
  static async status() {
    if (!WebPushDevice.VAPID_PUBLIC_KEY) return { state: WebPushDevice.State.UNCONFIGURED };
    if (!WebPushDevice.isSupported) {
      return { state: WebPushDevice.#isIOS && !WebPushDevice.#isStandalone ? WebPushDevice.State.NEEDS_INSTALL : WebPushDevice.State.UNSUPPORTED };
    }
    if (Notification.permission === "denied") return { state: WebPushDevice.State.DENIED };
    const registration = await WebPushDevice.#registration();
    const subscription = await registration.pushManager.getSubscription();
    return { state: subscription ? WebPushDevice.State.ON : WebPushDevice.State.OFF, subscription };
  }

  /** 권한을 묻고 구독합니다(버튼을 누른 순간에 불러야 브라우저가 허용 창을 띄웁니다). */
  static async enable() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "알림이 허용되지 않았어요." };
    const registration = await WebPushDevice.#registration();
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: WebPushDevice.#keyBytes(WebPushDevice.VAPID_PUBLIC_KEY),
      }));
    return { ok: true, subscription: subscription.toJSON() };
  }

  static async disable() {
    const registration = await WebPushDevice.#registration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { ok: true, endpoint: null };
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    return { ok: true, endpoint };
  }

  static #keyBytes(base64Url) {
    const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
    const raw = atob((base64Url + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
}

/** 예약 시각이 지난 콘텐츠의 푸시 발송을 깨웁니다. 정해진 시간마다 부르는 예약 작업(크론)이 기본이고,
 *  그게 없어도 사이트에 누가 들어올 때마다(브라우저당 몇 분에 한 번) 조용히 한 번 불러서 늦지 않게 합니다.
 *  발송은 콘텐츠마다 한 번만 되므로 여러 번 불려도 안전합니다. */
export class DispatchTrigger {
  static PATH = "/api/notifications/dispatch";
  static #KEY = "the-line:dispatch-tick";
  static INTERVAL_MS = 3 * 60 * 1000;

  static maybeRun() {
    if (typeof window === "undefined") return;
    try {
      const last = Number(window.localStorage.getItem(DispatchTrigger.#KEY) || 0);
      if (Date.now() - last < DispatchTrigger.INTERVAL_MS) return;
      window.localStorage.setItem(DispatchTrigger.#KEY, String(Date.now()));
    } catch {
      // 저장소를 못 쓰면(사생활 보호 모드 등) 그냥 한 번 부릅니다.
    }
    fetch(DispatchTrigger.PATH, { method: "POST", keepalive: true }).catch(() => {});
  }
}
