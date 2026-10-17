"use client";

// Real persistence layer for audio nanum + background music, backed by
// Supabase Storage + Postgres. 공통 동작(결과 객체, 미설정 처리, 업로드,
// 채널 한정)은 SupabaseRepository에 있고, 여기서는 테이블별 저장소만 정의합니다.
// 인스턴스는 채널마다 ChannelProvider가 만들어서 useChannel().repos로 나눠줍니다.

import { SupabaseRepository } from "@/lib/supabaseRepository";

/** 화면에서 쓰는 나눔 메타데이터(camelCase) ↔ audios 테이블 행(snake_case). */
export class AudioMetadata {
  constructor({
    title,
    pastorName = "",
    church = "",
    scriptureReference = "",
    category = "",
    tags = [],
    description = "",
    durationSeconds = 0,
    source = "recorded",
  }) {
    this.title = title;
    this.pastorName = pastorName;
    this.church = church;
    this.scriptureReference = scriptureReference;
    this.category = category;
    this.tags = tags;
    this.description = description;
    this.durationSeconds = durationSeconds;
    this.source = source;
  }

  /** 쉼표로 구분된 태그 입력 → 배열. */
  static parseTags(input) {
    return (input || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  /** 검색용 필드만 담은 행 — 수정(update) 때 이것만 갱신합니다. */
  toSearchableRow() {
    return {
      title: this.title,
      pastor_name: this.pastorName || null,
      church: this.church || null,
      scripture_reference: this.scriptureReference || null,
      category: this.category || null,
      tags: this.tags || [],
      description: this.description || null,
    };
  }
}

export class AudioRepository extends SupabaseRepository {
  static TABLE = "audios";
  static BUCKET = "audio";

  /** Upload a finished audio mix (+ optional script file) and insert its
   *  searchable metadata row. */
  async upload({ wavBlob, scriptFile, metadata }) {
    if (!this.configured) return this.notConfigured();
    const meta = metadata instanceof AudioMetadata ? metadata : new AudioMetadata(metadata);

    const id = SupabaseRepository.randomId();
    const audio = await this.uploadFile(AudioRepository.BUCKET, this.storagePath(`audios/${id}/mix.wav`), wavBlob, {
      contentType: "audio/wav",
    });
    if (!audio.ok) return audio;

    let scriptUrl = null;
    if (scriptFile) {
      const scriptExt = SupabaseRepository.safeStorageExtension(scriptFile.name);
      const script = await this.uploadFile(AudioRepository.BUCKET, this.storagePath(`audios/${id}/script${scriptExt}`), scriptFile);
      if (script.ok) scriptUrl = script.url;
    }

    return this.insertRow(AudioRepository.TABLE, {
      id,
      ...meta.toSearchableRow(),
      duration_seconds: meta.durationSeconds || 0,
      audio_url: audio.url,
      audio_file_name: "mix.wav",
      has_script: Boolean(scriptUrl),
      script_url: scriptUrl,
      script_file_name: scriptFile?.name || null,
      source: meta.source || "recorded",
    });
  }

  /** 제작/관리 페이지의 메타데이터 편집 — 오디오 파일은 그대로 두고 검색용
   *  필드만 갱신합니다. */
  async update(id, metadata) {
    if (!this.configured) return this.notConfigured();
    const meta = metadata instanceof AudioMetadata ? metadata : new AudioMetadata(metadata);
    const { data, error } = await this.scoped(
      this.client.from(AudioRepository.TABLE).update(meta.toSearchableRow()).eq("id", id)
    )
      .select()
      .single();
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok({ row: data });
  }

  /** 업로드한 콘텐츠를 삭제합니다. 스토리지의 실제 파일은 지금 단계에서는
   *  그대로 두고(정리는 나중 단계), DB 행만 지워서 피드에서 바로 사라지게 합니다. */
  async delete(id) {
    if (!this.configured) return this.notConfigured();
    return this.deleteRow(AudioRepository.TABLE, id);
  }

  /** 재생 시작 시 청취수 +1 (0008_audio_plays.sql의 함수). 실패해도 재생엔 영향 없음. */
  async recordPlay(id) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.client.rpc("increment_audio_plays", { target_audio: id });
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  /** Fetch the shared audio feed, optionally full-text searched. */
  async list({ search } = {}) {
    if (!this.configured) return this.notConfigured({ rows: [] });
    let query = this.scoped(this.client.from(AudioRepository.TABLE).select("*")).order("created_at", {
      ascending: false,
    });
    if (search) {
      query = query.textSearch("search_vector", search, { type: "websearch", config: "simple" });
    }
    const { data, error } = await query;
    if (error) return SupabaseRepository.fail(error.message, { rows: [] });
    return SupabaseRepository.ok({ rows: data });
  }
}

export class BackgroundTrackRepository extends SupabaseRepository {
  static TABLE = "background_tracks";
  static BUCKET = "background-music";

  /** Upload a personal background-music file and register it. Always goes
   *  into the uploader's own "내 라이브러리" (library_type: 'personal') — 공식
   *  라이브러리('official')는 별도의 관리자 업로드 경로로만 채워집니다. */
  async upload({ file, name, durationSeconds, genres = [], themes = [] }) {
    if (!this.configured) return this.notConfigured();

    const id = SupabaseRepository.randomId();
    const ext = SupabaseRepository.safeStorageExtension(file.name);
    const uploaded = await this.uploadFile(BackgroundTrackRepository.BUCKET, this.storagePath(`background/${id}/track${ext}`), file);
    if (!uploaded.ok) return uploaded;

    return this.insertRow(BackgroundTrackRepository.TABLE, {
      id,
      name,
      audio_url: uploaded.url,
      audio_file_name: file.name,
      duration_seconds: durationSeconds || 0,
      library_type: "personal",
      genres,
      themes,
    });
  }

  /** 라이브러리 종류별로 불러옵니다 — 실제로는 항상 'personal'을 넘겨서 다른
   *  창작자의 official 트랙이 내 라이브러리 목록에 섞이지 않도록 합니다. */
  async list({ libraryType } = {}) {
    if (!this.configured) return this.notConfigured({ rows: [] });
    let query = this.scoped(this.client.from(BackgroundTrackRepository.TABLE).select("*")).order("created_at", {
      ascending: false,
    });
    if (libraryType) {
      query = query.eq("library_type", libraryType);
    }
    const { data, error } = await query;
    if (error) return SupabaseRepository.fail(error.message, { rows: [] });
    return SupabaseRepository.ok({ rows: data });
  }

  async delete(id) {
    if (!this.configured) return this.notConfigured();
    return this.deleteRow(BackgroundTrackRepository.TABLE, id);
  }
}

