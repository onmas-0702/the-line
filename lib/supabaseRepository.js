// 모든 Supabase 저장소(Repository)의 공통 부모 클래스. 채널 레이아웃(서버
// 컴포넌트)에서도 쓰기 때문에 "use client"를 붙이지 않습니다.
// 모든 메서드는 throw 대신 { ok, ... } 결과 객체를 돌려주고, Supabase가 아직
// 설정되지 않았으면 { ok:false, reason:"not-configured" }를 돌려줍니다 —
// 호출하는 쪽은 그걸 보고 로컬 전용(blob URL / localStorage) 동작으로 대체합니다.

import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

export class SupabaseRepository {
  /** channelId를 주면 이 저장소의 모든 조회/저장이 그 채널로 한정됩니다.
   *  null이면 채널 구분 없는 레거시 단일 사이트 모드입니다. */
  constructor({ client = supabase, configured = isSupabaseConfigured, channelId = null } = {}) {
    this.client = client;
    this.configured = configured;
    this.channelId = channelId;
  }

  /** 쿼리를 이 저장소의 채널로 한정합니다. */
  scoped(query) {
    return this.channelId ? query.eq("channel_id", this.channelId) : query;
  }

  /** 새로 저장할 행에 채널을 붙입니다. */
  withChannel(row) {
    return this.channelId ? { ...row, channel_id: this.channelId } : row;
  }

  /** 스토리지 경로를 채널 폴더 아래로 둡니다(채널 삭제·용량 집계를 쉽게 하려고). */
  storagePath(path) {
    return this.channelId ? `channels/${this.channelId}/${path}` : path;
  }

  static ok(payload = {}) {
    return { ok: true, ...payload };
  }

  static fail(reason, payload = {}) {
    return { ok: false, reason, ...payload };
  }

  notConfigured(payload = {}) {
    return SupabaseRepository.fail("not-configured", payload);
  }

  static randomId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  // Supabase Storage 키는 제한된 ASCII 문자만 허용해서, 한글·공백·기호가 들어간
  // 원본 파일명(예: "창문을 여는 시간.wav")을 그대로 쓰면 "Invalid key"로
  // 실패합니다. 원본 이름은 DB 행에 따로 남기고, 저장 경로에는 안전한 고정
  // 이름 + 확장자만 씁니다.
  static safeStorageExtension(fileName) {
    const dotIndex = (fileName || "").lastIndexOf(".");
    const rawExt = dotIndex >= 0 ? fileName.slice(dotIndex) : "";
    return rawExt.replace(/[^a-zA-Z0-9.]/g, "") || "";
  }

  /** 스토리지 버킷에 파일을 올리고 공개 URL을 돌려줍니다. */
  async uploadFile(bucket, path, file, options = {}) {
    const { error } = await this.client.storage.from(bucket).upload(path, file, { upsert: false, ...options });
    if (error) return SupabaseRepository.fail(error.message);
    const { data } = this.client.storage.from(bucket).getPublicUrl(path);
    return SupabaseRepository.ok({ url: data.publicUrl });
  }

  async insertRow(table, row) {
    const { data, error } = await this.client.from(table).insert(this.withChannel(row)).select().single();
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok({ row: data });
  }

  async deleteRow(table, id) {
    const { error } = await this.scoped(this.client.from(table).delete().eq("id", id));
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }
}
