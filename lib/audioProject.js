"use client";

// 콘텐츠 오디오의 "편집 상태" — 저장한 뒤에도 제작 화면과 똑같이 다시 편집할 수 있게 합니다.
//   AudioEditSettings — 배경음악(곡 id)·배경음악 볼륨·인트로 길이·목소리 볼륨. audios.edit_settings(jsonb)에 저장. 불변.
//   VoiceGain         — 목소리 볼륨: 저장 파일엔 이미 반영돼 있어, 다시 불러올 때 수치를 되살리고 파일은 원래 크기로 되돌림
//   AudioRender       — 지금 편집 상태로 만든 최종 결과(목소리만 / 배경음악까지 섞은 것)
//   AudioProjectLoader — 저장된 콘텐츠 → 편집기에 넣을 클립·설정
//
// 저장할 때 "배경음악까지 섞은 완성본"과 함께 "목소리만"(voice.wav)도 올려 둡니다. 그래서 나중에
// 콘텐츠 관리에서 열면 목소리 클립 위에 배경음악을 바꾸거나 볼륨·인트로를 다시 맞출 수 있습니다.
// 이 기능 전에 저장한 콘텐츠는 목소리만 따로 없어서, 완성본(배경음악 포함)을 클립으로 불러옵니다.

import { AudioBufferOps, AudioEngine, BackgroundMixer, ClipGain, WavEncoder } from "@/lib/audio";
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

/** 목소리 클립 볼륨(게인). 저장할 때 목소리 파일(voice_url)에 이미 곱해 두므로, 그 값을 edit_settings.voiceGain에
 *  함께 남겨 두었다가 다시 불러올 때 화면 수치(+25% 등)를 되살리고 파일은 그만큼 나눠 원래 크기로 되돌립니다
 *  (그래야 저장할 때 두 번 곱해지지 않음). 클립마다 볼륨이 다르면 하나의 수치로 나타낼 수 없어 0%(1)로 둡니다. */
export class VoiceGain {
  static MIN_RESTORABLE = 0.05; // 이보다 작으면(거의 무음) 되돌릴 수 없어 0%로 불러옴

  /** 클립들 → 모두 같은 볼륨이면 그 값, 아니면 1 */
  static uniform(clips) {
    const gains = (clips || []).map((c) => (Number.isFinite(c.gain) ? c.gain : ClipGain.DEFAULT));
    if (!gains.length) return ClipGain.DEFAULT;
    return gains.every((g) => Math.abs(g - gains[0]) < 1e-6) ? gains[0] : ClipGain.DEFAULT;
  }

  static isRestorable(gain) {
    return Number.isFinite(gain) && gain >= VoiceGain.MIN_RESTORABLE && Math.abs(gain - ClipGain.DEFAULT) > 1e-6;
  }

  /** 볼륨이 곱해진 버퍼 → 원래 크기 버퍼 */
  static unapply(buffer, gain) {
    return VoiceGain.isRestorable(gain) ? AudioBufferOps.applyGain(buffer, 1 / gain) : buffer;
  }
}

export class AudioEditSettings {
  constructor({
    backgroundTrackId = null,
    musicVolume = ClipGain.DEFAULT,
    voiceOffsetSeconds = BackgroundMixer.DEFAULT_VOICE_OFFSET_SECONDS,
    musicClip = new MusicClip(),
    voiceGain = ClipGain.DEFAULT,
  } = {}) {
    this.voiceGain = ClipGain.clamp(Number.isFinite(voiceGain) ? voiceGain : ClipGain.DEFAULT);
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
      voiceGain: json.voiceGain == null ? ClipGain.DEFAULT : Number(json.voiceGain),
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
      voiceGain: this.voiceGain,
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
    const voiceGain = VoiceGain.uniform(new Timeline(segments).clips);
    const saved = new AudioEditSettings({ ...settings.toJSON(), voiceGain, backgroundTrackId: backgroundBuffer ? settings.backgroundTrackId : null });
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
      const settings = AudioEditSettings.fromJSON(item.editSettings);
      const gain = VoiceGain.isRestorable(settings.voiceGain) ? settings.voiceGain : ClipGain.DEFAULT;
      // 파일엔 볼륨이 이미 곱해져 있으니 나눠서 원래 크기로 → 클립 볼륨을 저장했던 수치로(들리는 소리는 그대로)
      const buffer = VoiceGain.unapply(await AudioEngine.decodeUrl(item.voiceUrl), gain);
      const originSource = { url: item.voiceUrl, gainScale: gain };
      return {
        segments: [Segment.restore({ buffer, originSource, source: "edited", name: "목소리", gain })],
        settings,
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
