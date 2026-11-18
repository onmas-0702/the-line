"use client";

// 콘텐츠 오디오의 "편집 상태" — 저장한 뒤에도 제작 화면과 똑같이 다시 편집할 수 있게 합니다.
//   AudioEditSettings — 배경음악(곡 id)·배경음악 볼륨·인트로 길이. audios.edit_settings(jsonb)에 저장. 불변.
//   AudioRender       — 지금 편집 상태로 만든 최종 결과(목소리만 / 배경음악까지 섞은 것)
//   AudioProjectLoader — 저장된 콘텐츠 → 편집기에 넣을 클립·설정
//
// 저장할 때 "배경음악까지 섞은 완성본"과 함께 "목소리만"(voice.wav)도 올려 둡니다. 그래서 나중에
// 콘텐츠 관리에서 열면 목소리 클립 위에 배경음악을 바꾸거나 볼륨·인트로를 다시 맞출 수 있습니다.
// 이 기능 전에 저장한 콘텐츠는 목소리만 따로 없어서, 완성본(배경음악 포함)을 클립으로 불러옵니다.

import { AudioEngine, BackgroundMixer, ClipGain, WavEncoder } from "@/lib/audio";
import { MusicArrangement } from "@/lib/musicArrangement";
import { Segment, Timeline } from "@/lib/timeline";

/** 배경음악 클립 — 두 가지 모양이 있습니다. 불변.
 *   · 기본(자동): 타임라인 시작 위치·곡 안 시작 위치(앞부분 트리밍)·끝(null = 마지막 목소리 + 페이드아웃).
 *     곡이 짧으면 자동으로 반복됩니다.
 *   · 편집됨(pieces): 배경음악 트랙에서 복사·붙이기·자르기·디졸브를 한 뒤 — 조각 목록(MusicArrangement)이
 *     startSeconds부터 차례로 이어집니다. 이때 offsetSeconds·endSeconds는 쓰지 않습니다. */
export class MusicClip {
  constructor({ startSeconds = 0, offsetSeconds = 0, endSeconds = null, pieces = null } = {}) {
    this.startSeconds = Math.max(0, Number(startSeconds) || 0);
    this.offsetSeconds = Math.max(0, Number(offsetSeconds) || 0);
    this.endSeconds = endSeconds === null || endSeconds === undefined || !Number.isFinite(Number(endSeconds)) ? null : Number(endSeconds);
    const arranged = Array.isArray(pieces) && pieces.length ? new MusicArrangement({ startSeconds: this.startSeconds, pieces }) : null;
    this.pieces = arranged && !arranged.isEmpty ? arranged.toJSON() : null;
    Object.freeze(this);
  }

  /** 편집된 배치 → 배경음악 클립. */
  static fromArrangement(arrangement) {
    return new MusicClip({ startSeconds: arrangement.startSeconds, pieces: arrangement.toJSON() });
  }

  get isAutoEnd() {
    return this.endSeconds === null && !this.isArranged;
  }

  /** 복사·자르기·디졸브로 편집한 상태인지. */
  get isArranged() {
    return this.pieces !== null;
  }

  arrangement() {
    return this.isArranged ? new MusicArrangement({ startSeconds: this.startSeconds, pieces: this.pieces }) : null;
  }

  with(patch) {
    return new MusicClip({ ...this.toJSON(), ...patch });
  }

  toJSON() {
    return { startSeconds: this.startSeconds, offsetSeconds: this.offsetSeconds, endSeconds: this.endSeconds, pieces: this.pieces };
  }
}

export class AudioEditSettings {
  constructor({
    backgroundTrackId = null,
    musicVolume = ClipGain.DEFAULT,
    voiceOffsetSeconds = BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS,
    musicClip = new MusicClip(),
  } = {}) {
    this.backgroundTrackId = backgroundTrackId || null;
    this.musicVolume = ClipGain.clamp(Number.isFinite(musicVolume) ? musicVolume : ClipGain.DEFAULT);
    this.voiceOffsetSeconds = Number.isFinite(voiceOffsetSeconds)
      ? Math.max(0, voiceOffsetSeconds)
      : BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS;
    this.musicClip = musicClip instanceof MusicClip ? musicClip : new MusicClip(musicClip || {});
    Object.freeze(this);
  }

  static fromJSON(json) {
    if (!json || typeof json !== "object") return new AudioEditSettings();
    return new AudioEditSettings({
      backgroundTrackId: json.backgroundTrackId ?? null,
      musicVolume: Number(json.musicVolume),
      voiceOffsetSeconds: Number(json.voiceOffsetSeconds),
      musicClip: new MusicClip(json.musicClip || {}),
    });
  }

  /** 이 설정으로 섞는 믹서 — 미리듣기·저장·타임라인 표시가 모두 이것을 씁니다. */
  mixer() {
    return BackgroundMixer.fromSettings(this);
  }

  toJSON() {
    return {
      backgroundTrackId: this.backgroundTrackId,
      musicVolume: this.musicVolume,
      voiceOffsetSeconds: this.voiceOffsetSeconds,
      musicClip: this.musicClip.toJSON(),
    };
  }
}

/** 편집 상태 → 저장할 결과. 미리듣기와 저장이 같은 계산을 씁니다. */
export class AudioRender {
  constructor({ voice, mix, settings }) {
    this.voice = voice; // 목소리만(빈 공간은 빼고, 클립 볼륨은 적용)
    this.mix = mix; // 배경음악까지 섞은 완성본(배경음악이 없으면 voice와 같음)
    this.settings = settings;
    Object.freeze(this);
  }

  /** backgroundBuffer가 없으면 목소리만 저장합니다. 클립이 없으면 null. */
  static from({ segments, backgroundBuffer = null, settings }) {
    const voice = new Timeline(segments).toBuffer({ skipGaps: true });
    if (!voice) return null;
    const mix = backgroundBuffer ? settings.mixer().mix(voice, backgroundBuffer) : voice;
    const saved = backgroundBuffer ? settings : new AudioEditSettings({ ...settings.toJSON(), backgroundTrackId: null });
    return new AudioRender({ voice, mix, settings: saved });
  }

  get durationSeconds() {
    return this.mix.duration;
  }

  mixBlob() {
    return WavEncoder.encode(this.mix);
  }

  voiceBlob() {
    return WavEncoder.encode(this.voice);
  }
}

/** 저장된 콘텐츠를 편집기로 불러옵니다. */
export class AudioProjectLoader {
  /** item(AudioMapper 결과) → { segments, settings, hasSeparateVoice } */
  static async load(item) {
    if (item.voiceUrl) {
      const buffer = await AudioEngine.decodeUrl(item.voiceUrl);
      return {
        segments: [Segment.clip({ buffer, source: "edited", name: "목소리", originSource: { url: item.voiceUrl } })],
        settings: AudioEditSettings.fromJSON(item.editSettings),
        hasSeparateVoice: true,
      };
    }
    if (!item.previewUrl) throw new Error("오디오 파일이 없어요.");
    const buffer = await AudioEngine.decodeUrl(item.previewUrl);
    return {
      segments: [Segment.clip({ buffer, source: "edited", name: "기존 오디오", originSource: { url: item.previewUrl } })],
      settings: new AudioEditSettings(),
      hasSeparateVoice: false,
    };
  }
}
