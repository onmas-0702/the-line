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
  /** cover: { coverAssetId, coverImageUrl } — 콘텐츠 배경이미지(없으면 생략).
   *  voiceBlob·editSettings: 다시 편집할 때 쓸 "목소리만" 파일과 배경음악 설정(0020). */
  /** publish: PublishSchedule — 예약이면 그 시각에 공개(0021). 바로 공개면 생략. */
  async upload({ wavBlob, scriptFile, metadata, cover = null, voiceBlob = null, editSettings = null, publish = null }) {
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

    const row = {
      id,
      ...meta.toSearchableRow(),
      duration_seconds: meta.durationSeconds || 0,
      audio_url: audio.url,
      audio_file_name: "mix.wav",
      has_script: Boolean(scriptUrl),
      script_url: scriptUrl,
      script_file_name: scriptFile?.name || null,
      source: meta.source || "recorded",
    };
    // 예약 공개는 꼭 지켜져야 해서(빠지면 바로 공개돼 버림) 다른 새 컬럼과 달리 빼고 다시 넣지 않습니다.
    if (publish?.isScheduled) row.publish_at = publish.toColumn();
    const coverColumns = cover?.coverImageUrl ? AudioRepository.#coverColumns(cover) : null;
    const projectColumns = await this.#uploadProject(id, voiceBlob, editSettings);

    // 새 컬럼(배경이미지 0012, 다시 편집 0020)이 아직 없는 DB에서도 콘텐츠는 저장되도록,
    // 실패하면 그 컬럼을 하나씩 빼고 다시 넣습니다.
    const attempts = [
      { ...row, ...coverColumns, ...projectColumns },
      { ...row, ...coverColumns },
      row,
    ];
    let last = null;
    for (const [i, attempt] of attempts.entries()) {
      if (i > 0 && JSON.stringify(attempt) === JSON.stringify(attempts[i - 1])) continue;
      last = await this.insertRow(AudioRepository.TABLE, attempt);
      if (last.ok) {
        return {
          ...last,
          coverSkipped: coverColumns && !("cover_image_url" in attempt) ? "배경이미지 컬럼 없음" : undefined,
          projectSkipped: Boolean(projectColumns) && !("edit_settings" in attempt),
        };
      }
    }
    return publish?.isScheduled && /publish_at/.test(last?.reason || "")
      ? SupabaseRepository.fail("예약 공개는 DB 업데이트(마이그레이션 0021)를 실행한 뒤에 쓸 수 있어요.")
      : last;
  }

  /** 공개 시점 바꾸기 — 예약 시각을 옮기거나(알림도 그 시각에 다시), 지금 바로 공개. */
  async updatePublishAt(id, schedule) {
    if (!this.configured) return this.notConfigured();
    const patch = { publish_at: schedule.isScheduled ? schedule.toColumn() : new Date().toISOString(), notified_at: null };
    const { data, error } = await this.scoped(this.client.from(AudioRepository.TABLE).update(patch).eq("id", id))
      .select()
      .single();
    if (error) {
      return SupabaseRepository.fail(
        /publish_at|notified_at/.test(error.message) ? "DB 업데이트(마이그레이션 0021) 전이라 공개 시점을 바꿀 수 없어요." : error.message
      );
    }
    return SupabaseRepository.ok({ row: data });
  }

  /** "목소리만" 파일을 올리고 콘텐츠 행에 넣을 컬럼을 돌려줍니다(없거나 실패하면 null). */
  async #uploadProject(id, voiceBlob, editSettings) {
    if (!voiceBlob) return null;
    const voice = await this.uploadFile(
      AudioRepository.BUCKET,
      this.storagePath(`audios/${id}/voice-${Date.now()}.wav`),
      voiceBlob,
      { contentType: "audio/wav" }
    );
    if (!voice.ok) return null;
    return { voice_url: voice.url, edit_settings: editSettings?.toJSON?.() ?? editSettings ?? null };
  }

  static #coverColumns({ coverAssetId = null, coverImageUrl = null }) {
    return { cover_asset_id: coverAssetId, cover_image_url: coverImageUrl };
  }

  /** 콘텐츠 배경이미지만 바꿉니다(null이면 채널 기본 배경 이미지로 되돌림). */
  async updateCover(id, cover) {
    if (!this.configured) return this.notConfigured();
    const { error } = await this.scoped(
      this.client.from(AudioRepository.TABLE).update(AudioRepository.#coverColumns(cover || {})).eq("id", id)
    );
    if (error) return SupabaseRepository.fail(error.message);
    return SupabaseRepository.ok();
  }

  /** 스튜디오 페이지의 메타데이터 편집 — 오디오 파일은 그대로 두고 검색용
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

  /** 콘텐츠 관리에서 다시 편집한 오디오로 바꿉니다(정보·배경이미지·청취수는 그대로).
   *  render: AudioRender — 완성본은 새 이름으로 올리고, 목소리만 파일·편집 설정도 함께 바꿉니다.
   *  예전 파일은 스토리지에 남겨 둡니다(삭제와 같은 방식, 정리는 나중 단계). */
  async replaceEditedAudio(id, render) {
    if (!this.configured) return this.notConfigured();
    const stamp = Date.now();
    const uploaded = await this.uploadFile(
      AudioRepository.BUCKET,
      this.storagePath(`audios/${id}/mix-${stamp}.wav`),
      render.mixBlob(),
      { contentType: "audio/wav" }
    );
    if (!uploaded.ok) return uploaded;
    const base = { audio_url: uploaded.url, audio_file_name: `mix-${stamp}.wav`, duration_seconds: render.durationSeconds };
    const project = await this.#uploadProject(id, render.voiceBlob(), render.settings);
    const update = async (patch) =>
      this.scoped(this.client.from(AudioRepository.TABLE).update(patch).eq("id", id)).select().single();
    let result = await update({ ...base, ...project });
    let projectSkipped = false;
    if (result.error && project) {
      // 0020 전이면 완성본만 바꿉니다.
      result = await update(base);
      projectSkipped = true;
    }
    if (result.error) return SupabaseRepository.fail(result.error.message);
    return SupabaseRepository.ok({ row: result.data, projectSkipped });
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

  /** 분류(악기·분위기) 변경 — tags는 TrackClassification.toTags() 결과. */
  async updateTags(id, { genres, themes }) {
    if (!this.configured) return this.notConfigured();
    const { data, error } = await this.scoped(
      this.client.from(BackgroundTrackRepository.TABLE).update({ genres, themes }).eq("id", id)
    ).select("id");
    if (error) return SupabaseRepository.fail(error.message);
    // 수정 권한(정책)이 없으면 오류 없이 0건만 바뀌므로, 실제로 바뀌었는지 확인합니다.
    if (!data?.length) return SupabaseRepository.fail("수정 권한이 없어요(마이그레이션 0014 적용 필요)");
    return SupabaseRepository.ok();
  }
}

