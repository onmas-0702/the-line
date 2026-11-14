// 서버 전용 — 공개 시각이 지난 콘텐츠를 알림을 켠 구독자의 휴대폰으로 푸시합니다.
// app/api/notifications/dispatch/route.js가 부릅니다(예약 작업/크론 또는 사이트 방문 때 DispatchTrigger).
//
//   PushConfig          — 서버 환경변수(키) 확인
//   PublicationNotifier — 발송할 콘텐츠 고르기 → 한 번만 보내도록 먼저 "보냄" 표시 → 구독자 기기로 발송
//
// 필요한 환경변수(.env.local / Vercel):
//   SUPABASE_SERVICE_ROLE_KEY      — 모든 구독자의 알림 기기를 읽기 위한 서버 전용 키(브라우저에 절대 노출 금지)
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY   — 푸시 공개 키(브라우저가 구독할 때 씀)
//   VAPID_PRIVATE_KEY              — 푸시 비밀 키(서버 전용)
//   VAPID_SUBJECT                  — 연락처(mailto:… 또는 https://…) — 푸시 서비스가 문제 있을 때 연락하는 곳
// 키는 `npx web-push generate-vapid-keys`로 만듭니다.

import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { Channel, ChannelSlug } from "@/lib/channel";

export class PushConfig {
  constructor(env = process.env) {
    this.supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
    this.serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
    this.publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
    this.privateKey = env.VAPID_PRIVATE_KEY || "";
    this.subject = env.VAPID_SUBJECT || "";
    Object.freeze(this);
  }

  /** 빠진 환경변수 이름들(없으면 []). */
  get missing() {
    return Object.entries({
      NEXT_PUBLIC_SUPABASE_URL: this.supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: this.serviceRoleKey,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: this.publicKey,
      VAPID_PRIVATE_KEY: this.privateKey,
      VAPID_SUBJECT: this.subject,
    })
      .filter(([, value]) => !value)
      .map(([name]) => name);
  }

  get isReady() {
    return this.missing.length === 0;
  }
}

export class PublicationNotifier {
  static BATCH = 10; // 한 번에 다룰 콘텐츠 수
  static MAX_AGE_HOURS = 24; // 이보다 오래 전에 공개된 것은 늦은 알림이 되므로 보내지 않고 "보냄"만 표시

  constructor(config = new PushConfig()) {
    this.config = config;
    this.db = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } });
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  }

  /** 발송 한 번. { sent, removed, contents } */
  async dispatch(now = new Date()) {
    const due = await this.#dueContents(now);
    if (due.length === 0) return { sent: 0, removed: 0, contents: [] };

    const contents = [];
    for (const content of due) {
      // 동시에 두 번 불려도 한 번만 보내도록, 먼저 "보냄" 표시를 차지한 쪽만 보냅니다.
      if (await this.#claim(content.id, now)) contents.push(content);
    }
    const fresh = contents.filter((c) => now - new Date(c.publish_at) <= PublicationNotifier.MAX_AGE_HOURS * 3600 * 1000);
    if (fresh.length === 0) return { sent: 0, removed: 0, contents: contents.map((c) => c.id) };

    const devices = await this.#subscriberDevices();
    let sent = 0;
    let removed = 0;
    for (const content of fresh) {
      const payload = JSON.stringify(PublicationNotifier.#payload(content));
      for (const device of devices) {
        const result = await this.#send(device, payload);
        if (result === "sent") sent += 1;
        if (result === "gone") removed += 1;
      }
    }
    return { sent, removed, contents: contents.map((c) => c.id) };
  }

  async #dueContents(now) {
    const { data, error } = await this.db
      .from("audios")
      .select("id, title, publish_at, channels(slug, name)")
      .is("notified_at", null)
      .lte("publish_at", now.toISOString())
      .order("publish_at", { ascending: true })
      .limit(PublicationNotifier.BATCH);
    if (error) throw new Error(error.message);
    return data || [];
  }

  async #claim(id, now) {
    const { data, error } = await this.db
      .from("audios")
      .update({ notified_at: now.toISOString() })
      .eq("id", id)
      .is("notified_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return (data || []).length > 0;
  }

  /** 알림을 켠 기기 중, 지금 구독자(또는 운영자)인 사람의 것만. */
  async #subscriberDevices() {
    const { data, error } = await this.db.from("push_subscriptions").select("endpoint, p256dh, auth, user_id");
    if (error) throw new Error(error.message);
    const rows = data || [];
    const allowed = new Map();
    for (const userId of new Set(rows.map((r) => r.user_id))) {
      const { data: ok } = await this.db.rpc("has_subscriber_access", { target_user: userId });
      allowed.set(userId, Boolean(ok));
    }
    return rows.filter((r) => allowed.get(r.user_id));
  }

  /** "sent" | "gone"(만료된 기기 — 지움) | "failed" */
  async #send(device, payload) {
    try {
      await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, {
        TTL: 6 * 3600,
      });
      return "sent";
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await this.db.from("push_subscriptions").delete().eq("endpoint", device.endpoint);
        return "gone";
      }
      return "failed";
    }
  }

  static #payload(content) {
    const slug = content.channels?.slug || ChannelSlug.DEFAULT;
    return {
      title: "새 메시지가 올라왔어요",
      body: `${content.title || "제목 없는 나눔"}${content.channels?.name ? ` · ${content.channels.name}` : ""}`,
      url: Channel.contentHref(slug, content.id),
      tag: `content-${content.id}`,
    };
  }
}
