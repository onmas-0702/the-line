// 플랫폼 메인 배너 — 스튜디오 "배너" 탭(운영 채널 전용)에서 올리고, 메인 페이지에서 옆으로 넘겨 보여 줍니다.
//   LandingBanner    — 배너 한 장(불변)
//   BannerLink       — 운영자가 적은 주소를 확인·정리(사이트 안 주소 / https 주소)
//   BannerUpload     — 고른 이미지를 배너 규격(가로 5:2)으로 잘라 줄임
//   BannerOrder      — 순서 옮기기(새 배열을 돌려줌)
//   BannerRepository — landing_banners 표(0024) + 'gallery-display' 버킷
// 서버·클라이언트 양쪽에서 불러도 되도록 "use client"를 붙이지 않습니다(이미지 처리는 브라우저에서만 부름).

import { ImageSpec } from "@/lib/imageSpec";
import { SupabaseRepository } from "@/lib/supabaseRepository";

export class LandingBanner {
  constructor({ id, title = "", linkUrl = "", imageUrl, imagePath = "", sortOrder = 0, status = "active" }) {
    this.id = id;
    this.title = title;
    this.linkUrl = linkUrl;
    this.imageUrl = imageUrl;
    this.imagePath = imagePath;
    this.sortOrder = sortOrder;
    this.status = status;
    Object.freeze(this);
  }

  static fromRow(row) {
    return new LandingBanner({
      id: row.id,
      title: row.title || "",
      linkUrl: row.link_url || "",
      imageUrl: row.image_url,
      imagePath: row.image_path || "",
      sortOrder: row.sort_order ?? 0,
      status: row.status || "active",
    });
  }

  get isActive() {
    return this.status === "active";
  }

  get hasLink() {
    return Boolean(this.linkUrl);
  }

  get isExternal() {
    return BannerLink.isExternal(this.linkUrl);
  }

  with(patch) {
    return new LandingBanner({ ...this, ...patch });
  }
}

export class BannerLink {
  /** 적은 주소를 저장할 모양으로 — 빈칸은 "", 사이트 안 주소(/…)와 http(s) 주소만 받습니다.
   *  "www.…"나 "example.com/…"처럼 앞을 빼고 적으면 https://를 붙입니다. 이상하면 null. */
  static normalize(input) {
    const value = (input || "").trim();
    if (!value) return "";
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    const withScheme = /^https?:\/\//i.test(value) ? value : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(value) ? `https://${value}` : "";
    if (!withScheme) return null;
    try {
      const url = new URL(withScheme);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  }

  static isExternal(url) {
    return /^https?:\/\//i.test(url || "");
  }

  static GUIDE = "비워 두면 누를 수 없는 배너가 돼요. 예: /theline (사이트 안) · https://… (다른 사이트, 새 창)";
}

export class BannerUpload {
  /** 메인 화면 가로 폭에 맞춘 5:2 — 휴대폰에서도 너무 얇지 않게. */
  static SPEC = new ImageSpec({
    aspectWidth: 5,
    aspectHeight: 2,
    outputWidth: 1500,
    minWidth: 750,
    maxBytes: 15 * 1024 * 1024,
  });

  static get guide() {
    return BannerUpload.SPEC.guide;
  }

  static get acceptAttribute() {
    return BannerUpload.SPEC.acceptAttribute;
  }

  /** 파일 → 규격에 맞춘 이미지 Blob(ImageSpecError를 던질 수 있음). */
  static prepare(file) {
    return BannerUpload.SPEC.process(file);
  }
}

export class BannerOrder {
  /** index번째를 delta(-1 위로, +1 아래로)만큼 옮긴 새 배열. 끝이면 그대로. */
  static move(list, index, delta) {
    const target = index + delta;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
}

export class BannerRepository extends SupabaseRepository {
  static TABLE = "landing_banners";
  static BUCKET = "gallery-display";

  /** 순서대로. includeHidden: 스튜디오에서 숨긴 것까지. */
  async list({ includeHidden = false } = {}) {
    if (!this.configured) return this.notConfigured({ banners: [] });
    let query = this.client
      .from(BannerRepository.TABLE)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (!includeHidden) query = query.eq("status", "active");
    const { data, error } = await query;
    if (error) return SupabaseRepository.fail(BannerRepository.#reason(error), { banners: [] });
    return SupabaseRepository.ok({ banners: data.map(LandingBanner.fromRow) });
  }

  /** 이미지를 올리고 맨 뒤에 붙입니다. */
  async create({ image, title = "", linkUrl = "", sortOrder = 0 }) {
    if (!this.configured) return this.notConfigured();
    if (!this.channelId) return SupabaseRepository.fail("채널 정보가 없어요");
    const id = SupabaseRepository.randomId();
    const path = this.storagePath(`banners/${id}.webp`);
    const uploaded = await this.uploadFile(BannerRepository.BUCKET, path, image, { contentType: "image/webp" });
    if (!uploaded.ok) return uploaded;
    const { data, error } = await this.client
      .from(BannerRepository.TABLE)
      .insert({
        id,
        channel_id: this.channelId,
        title: title.trim(),
        link_url: linkUrl || null,
        image_url: uploaded.url,
        image_path: path,
        sort_order: sortOrder,
      })
      .select()
      .single();
    if (error) {
      await this.client.storage.from(BannerRepository.BUCKET).remove([path]);
      return SupabaseRepository.fail(BannerRepository.#reason(error));
    }
    return SupabaseRepository.ok({ banner: LandingBanner.fromRow(data) });
  }

  /** 글·주소·공개 여부 바꾸기. 권한이 없으면 오류 없이 0건만 바뀌므로 그것도 실패로 알립니다. */
  async update(id, { title, linkUrl, status }) {
    if (!this.configured) return this.notConfigured();
    const patch = {};
    if (title !== undefined) patch.title = title.trim();
    if (linkUrl !== undefined) patch.link_url = linkUrl || null;
    if (status !== undefined) patch.status = status;
    const { data, error } = await this.client.from(BannerRepository.TABLE).update(patch).eq("id", id).select();
    if (error) return SupabaseRepository.fail(BannerRepository.#reason(error));
    if (!data?.length) return SupabaseRepository.fail("수정 권한이 없어요");
    return SupabaseRepository.ok({ banner: LandingBanner.fromRow(data[0]) });
  }

  /** 지금 배열 순서대로 sort_order를 0, 1, 2…로 다시 매깁니다. */
  async saveOrder(banners) {
    if (!this.configured) return this.notConfigured();
    const results = await Promise.all(
      banners.map((banner, i) => this.client.from(BannerRepository.TABLE).update({ sort_order: i }).eq("id", banner.id))
    );
    const failed = results.find((r) => r.error);
    return failed ? SupabaseRepository.fail(failed.error.message) : SupabaseRepository.ok();
  }

  async remove(banner) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.from(BannerRepository.TABLE).delete().eq("id", banner.id);
    if (error) return SupabaseRepository.fail(error.message);
    if (banner.imagePath) await this.client.storage.from(BannerRepository.BUCKET).remove([banner.imagePath]);
    return SupabaseRepository.ok();
  }

  static #reason(error) {
    return /landing_banners/.test(error.message) && /exist|find|schema/i.test(error.message)
      ? "DB 업데이트(마이그레이션 0024)를 실행한 뒤에 쓸 수 있어요."
      : error.message;
  }
}
