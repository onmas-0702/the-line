"use client";

// 콘텐츠 제작 "작업 저장하기" — 업로드(공개)와 별개로 편집 상태를 DB에 저장했다가 불러옵니다(0022).
//   AudioDraftSnapshot — 편집 상태(클립·빈 공간·배경음악·정보·공개 시점) ↔ 저장용 JSON. 불변.
//   AudioDraftRepository — 채널의 저장한 작업 목록·저장·불러오기·지우기 + 원본 오디오 보관('drafts' 버킷)
//   AudioDraftLoader — 저장한 JSON → 편집기에 넣을 클립(원본을 받아 디코딩, 같은 원본은 한 번만)
//
// 원본 오디오는 클립마다가 아니라 "원본마다" 한 번만 보관합니다(자른 조각들은 같은 원본을 가리킴).
// 녹음·올린 파일은 그 파일 그대로(압축된 mp3·녹음 파일이라 작음), 이미 서버에 있는 오디오는 주소만 남깁니다.

import { AudioEngine, PeakMap } from "@/lib/audio";
import { AudioEditSettings } from "@/lib/audioProject";
import { PublishSchedule } from "@/lib/publishing";
import { Segment } from "@/lib/timeline";
import { SupabaseRepository } from "@/lib/supabaseRepository";

export class AudioDraftSnapshot {
  static VERSION = 1;

  constructor({ title = "", tagsInput = "", description = "", publishAt = null, isPrivate = false, settings, segments }) {
    this.title = title;
    this.tagsInput = tagsInput;
    this.description = description;
    this.publishAt = publishAt; // ISO | null
    this.isPrivate = Boolean(isPrivate); // 비공개로 올리기
    this.settings = settings; // AudioEditSettings
    this.segments = segments; // 편집기의 segments 배열
    Object.freeze(this);
  }

  /** 원본별 목록(같은 buffer는 하나로)과, 클립이 몇 번째 원본을 쓰는지. */
  sources() {
    const index = new Map();
    const list = [];
    for (const seg of this.segments) {
      if (seg.type !== "clip" || index.has(seg.origin)) continue;
      index.set(seg.origin, list.length);
      list.push({ buffer: seg.origin, originSource: seg.originSource, name: seg.name });
    }
    return { list, index };
  }

  /** 저장용 JSON — refs[i]는 i번째 원본이 저장된 곳({ url } 또는 { path }). */
  toJSON(refs) {
    const { index } = this.sources();
    return {
      version: AudioDraftSnapshot.VERSION,
      sources: refs,
      segments: this.segments.map((seg) =>
        seg.type === "gap"
          ? { type: "gap", duration: seg.duration }
          : {
              type: "clip",
              source: index.get(seg.origin),
              name: seg.name,
              kind: seg.source,
              inSample: seg.inSample,
              outSample: seg.outSample,
              gain: seg.gain,
            }
      ),
      settings: this.settings.toJSON(),
      meta: { title: this.title, tagsInput: this.tagsInput, description: this.description, publishAt: this.publishAt, isPrivate: this.isPrivate },
    };
  }
}

export class AudioDraftRepository extends SupabaseRepository {
  static TABLE = "audio_drafts";
  static BUCKET = "drafts";

  async list() {
    if (!this.configured) return this.notConfigured({ drafts: [] });
    const { data, error } = await this.scoped(
      this.client.from(AudioDraftRepository.TABLE).select("id, title, updated_at, data")
    ).order("updated_at", { ascending: false });
    if (error) return SupabaseRepository.fail(AudioDraftRepository.#explain(error.message), { drafts: [] });
    const drafts = (data || []).map((row) => ({
      id: row.id,
      title: row.title || "제목 없는 작업",
      updatedAt: row.updated_at,
      clipCount: (row.data?.segments || []).filter((s) => s.type === "clip").length,
      data: row.data,
    }));
    return SupabaseRepository.ok({ drafts });
  }

  /** 저장(새로 만들거나 draftId에 덮어쓰기). uploaded: Map<AudioBuffer, path> — 이미 올린 원본은 다시 올리지 않습니다. */
  async save({ draftId = null, snapshot, uploaded = new Map() }) {
    if (!this.configured) return this.notConfigured();
    const id = draftId || SupabaseRepository.randomId();
    const { list } = snapshot.sources();
    const refs = [];
    for (const [i, source] of list.entries()) {
      const ref = await this.#sourceRef(id, i, source, uploaded);
      if (!ref.ok) return ref;
      refs.push(ref.ref);
    }
    const row = this.withChannel({ id, title: snapshot.title.trim() || "제목 없는 작업", data: snapshot.toJSON(refs) });
    const { data, error } = await this.client.from(AudioDraftRepository.TABLE).upsert(row).select("id, title, updated_at").single();
    if (error) return SupabaseRepository.fail(AudioDraftRepository.#explain(error.message));
    return SupabaseRepository.ok({ draft: { id: data.id, title: data.title, updatedAt: data.updated_at } });
  }

  async #sourceRef(draftId, i, source, uploaded) {
    const origin = source.originSource || {};
    if (origin.url) return SupabaseRepository.ok({ ref: { url: origin.url, name: source.name } });
    if (origin.path) return SupabaseRepository.ok({ ref: { path: origin.path, name: source.name } });
    if (uploaded.has(source.buffer)) return SupabaseRepository.ok({ ref: { path: uploaded.get(source.buffer), name: source.name } });
    if (!origin.blob) return SupabaseRepository.fail("원본 오디오를 찾을 수 없는 클립이 있어요.");
    const ext = SupabaseRepository.safeStorageExtension(origin.blob.name || "") || AudioDraftRepository.#extFor(origin.blob.type);
    const path = this.storagePath(`drafts/${draftId}/source-${i}-${Date.now()}${ext}`);
    const { error } = await this.client.storage
      .from(AudioDraftRepository.BUCKET)
      .upload(path, origin.blob, { upsert: false, contentType: origin.blob.type || undefined });
    if (error) return SupabaseRepository.fail(AudioDraftRepository.#explain(error.message));
    uploaded.set(source.buffer, path);
    return SupabaseRepository.ok({ ref: { path, name: source.name } });
  }

  static #extFor(type = "") {
    if (type.includes("webm")) return ".webm";
    if (type.includes("ogg")) return ".ogg";
    if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return ".m4a";
    if (type.includes("mpeg") || type.includes("mp3")) return ".mp3";
    if (type.includes("wav")) return ".wav";
    return ".audio";
  }

  /** 'drafts' 버킷의 원본 받기. */
  async download(path) {
    const { data, error } = await this.client.storage.from(AudioDraftRepository.BUCKET).download(path);
    if (error) throw new Error(error.message);
    return data;
  }

  /** 작업과 그 원본 파일들을 지웁니다. */
  async remove(draft) {
    if (!this.configured) return this.notConfigured();
    const paths = (draft.data?.sources || []).map((s) => s.path).filter(Boolean);
    if (paths.length > 0) await this.client.storage.from(AudioDraftRepository.BUCKET).remove(paths);
    const { error } = await this.scoped(this.client.from(AudioDraftRepository.TABLE).delete().eq("id", draft.id));
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  static #explain(message = "") {
    return /audio_drafts|drafts|bucket/i.test(message) && /not|exist|find/i.test(message)
      ? "작업 저장은 DB 업데이트(마이그레이션 0022)를 실행한 뒤에 쓸 수 있어요."
      : message;
  }
}

export class AudioDraftLoader {
  /** draft(목록의 항목) → { segments, settings, meta, uploaded(Map<buffer, path>) } */
  static async load(draft, repository) {
    const data = draft.data || {};
    const sources = data.sources || [];
    const uploaded = new Map();
    const decoded = await Promise.all(
      sources.map(async (ref) => {
        const buffer = ref.url
          ? await AudioEngine.decodeUrl(ref.url)
          : await AudioEngine.decodeBlob(await repository.download(ref.path));
        if (ref.path) uploaded.set(buffer, ref.path);
        return { buffer, peaks: PeakMap.fromBuffer(buffer), originSource: ref.url ? { url: ref.url } : { path: ref.path } };
      })
    );
    const segments = (data.segments || [])
      .map((s) => {
        if (s.type === "gap") return Segment.gap(Segment.nextClipId(), s.duration || 0);
        const src = decoded[s.source];
        if (!src) return null;
        return Segment.restore({ ...src, source: s.kind, name: s.name, inSample: s.inSample, outSample: s.outSample, gain: s.gain });
      })
      .filter(Boolean);
    const meta = data.meta || {};
    return {
      segments,
      settings: AudioEditSettings.fromJSON(data.settings),
      meta: {
        title: meta.title || "",
        tagsInput: meta.tagsInput || "",
        description: meta.description || "",
        publish: meta.isPrivate
          ? PublishSchedule.private()
          : meta.publishAt
            ? PublishSchedule.at(new Date(meta.publishAt))
            : PublishSchedule.now(),
      },
      uploaded,
    };
  }
}
