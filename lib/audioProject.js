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
import { Segment, Timeline } from "@/lib/timeline";

export class AudioEditSettings {
  constructor({
    backgroundTrackId = null,
    musicVolume = ClipGain.DEFAULT,
    voiceOffsetSeconds = BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS,
  } = {}) {
    this.backgroundTrackId = backgroundTrackId || null;
    this.musicVolume = ClipGain.clamp(Number.isFinite(musicVolume) ? musicVolume : ClipGain.DEFAULT);
    this.voiceOffsetSeconds = Number.isFinite(voiceOffsetSeconds)
      ? Math.max(0, voiceOffsetSeconds)
      : BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS;
    Object.freeze(this);
  }

  static fromJSON(json) {
    if (!json || typeof json !== "object") return new AudioEditSettings();
    return new AudioEditSettings({
      backgroundTrackId: json.backgroundTrackId ?? null,
      musicVolume: Number(json.musicVolume),
      voiceOffsetSeconds: Number(json.voiceOffsetSeconds),
    });
  }

  toJSON() {
    return {
      backgroundTrackId: this.backgroundTrackId,
      musicVolume: this.musicVolume,
      voiceOffsetSeconds: this.voiceOffsetSeconds,
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
    const mix = backgroundBuffer
      ? new BackgroundMixer({ volume: settings.musicVolume, voiceOffsetSeconds: settings.voiceOffsetSeconds }).mix(
          voice,
          backgroundBuffer
        )
      : voice;
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
        segments: [Segment.clip({ buffer, source: "edited", name: "목소리" })],
        settings: AudioEditSettings.fromJSON(item.editSettings),
        hasSeparateVoice: true,
      };
    }
    if (!item.previewUrl) throw new Error("오디오 파일이 없어요.");
    const buffer = await AudioEngine.decodeUrl(item.previewUrl);
    return {
      segments: [Segment.clip({ buffer, source: "edited", name: "기존 오디오" })],
      settings: new AudioEditSettings(),
      hasSeparateVoice: false,
    };
  }
}
