"use client";

// 마이크 녹음 — 녹음 페이지에서 스트림/MediaRecorder/워밍업 타이머를 직접
// 들고 있던 로직을 클래스로 옮겼습니다.

export class MicrophoneDevices {
  /** 실제 마이크 목록 (권한을 한 번 허용해야 이름이 표시됩니다). */
  static async list() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }

  static onChange(listener) {
    navigator.mediaDevices?.addEventListener?.("devicechange", listener);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", listener);
  }
}

export class RecorderError extends Error {}

export class MicrophoneRecorder {
  static #MIME_CANDIDATES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  // 마이크를 새로 열 때 브라우저/운영체제가 입력 레벨을 스스로 다시 맞추는
  // 짧은 "적응 시간"이 있어서, autoGainControl을 꺼도 초반 1초 남짓은 소리가
  // 커졌다 작아지는 현상이 완전히 사라지지 않는 경우가 있습니다. 그래서
  // 스트림을 연 뒤 이 시간만큼 조용히 기다렸다가(화면엔 "마이크 준비 중"으로
  // 표시) 적응이 끝난 다음에야 실제 녹음을 시작합니다 — 이 대기 구간은
  // 녹음되지 않으므로 결과물에는 그 흔들림이 남지 않습니다.
  static WARMUP_MS = 900;

  #stream = null;
  #mediaRecorder = null;
  #chunks = [];
  #warmupTimer = null;

  /** @param {{ onPreparingChange?: (b: boolean) => void, onStart?: () => void,
   *            onDevicesRefreshed?: (mics: MediaDeviceInfo[]) => void }} callbacks */
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
  }

  static #pickMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    return MicrophoneRecorder.#MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
  }

  get isPreparing() {
    return this.#warmupTimer !== null;
  }

  /** 스트림을 열고 워밍업 후 녹음을 시작합니다. 녹음이 끝나면 onRecorded(blob). */
  async start({ deviceId, onRecorded }) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new RecorderError("이 브라우저에서는 마이크 녹음을 지원하지 않습니다.");
    }
    try {
      // autoGainControl을 켜두면 녹음 시작 후 처음 몇 초 동안 입력 레벨을 계속
      // 다시 맞추면서 "커졌다가 작아지는" 것처럼 들려서 꺼둡니다(에코 제거·노이즈
      // 억제는 음성 녹음에 도움이 되니 그대로 켜둡니다).
      this.#stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          autoGainControl: false,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (err) {
      throw new RecorderError("마이크에 접근할 수 없습니다. 브라우저의 마이크 권한을 확인해주세요.");
    }

    // 일부 브라우저는 getUserMedia 제약을 트랙에 완전히 반영하지 않아서,
    // 트랙에도 한 번 더 명시적으로 적용합니다(미지원 브라우저에서는 무시).
    const [audioTrack] = this.#stream.getAudioTracks();
    try {
      await audioTrack?.applyConstraints({ autoGainControl: false });
    } catch (e) {
      // 일부 기기/브라우저는 이 재적용을 지원하지 않을 수 있어요 — 무시하고 진행합니다.
    }

    // Device labels are only visible after permission is granted —
    // refresh the list now that we have it.
    MicrophoneDevices.list()
      .then((mics) => this.callbacks.onDevicesRefreshed?.(mics))
      .catch(() => {});

    this.callbacks.onPreparingChange?.(true);
    this.#warmupTimer = setTimeout(() => {
      this.#warmupTimer = null;
      // 대기하는 동안 사용자가 취소했다면(스트림이 이미 정리됐다면) 시작하지 않습니다.
      if (!this.#stream) return;
      this.callbacks.onPreparingChange?.(false);
      this.#beginRecording(onRecorded);
    }, MicrophoneRecorder.WARMUP_MS);
  }

  #beginRecording(onRecorded) {
    const mimeType = MicrophoneRecorder.#pickMimeType();
    const mr = mimeType ? new MediaRecorder(this.#stream, { mimeType }) : new MediaRecorder(this.#stream);
    this.#chunks = [];
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.#chunks.push(e.data);
    };
    mr.onstop = async () => {
      const blob = new Blob(this.#chunks, { type: mr.mimeType || mimeType || "audio/webm" });
      this.#releaseStream();
      await onRecorded(blob);
    };
    this.#mediaRecorder = mr;
    mr.start();
    this.callbacks.onStart?.();
  }

  /** 녹음을 끝냅니다. 아직 "마이크 준비 중"이면 녹음을 시작하지 않고 조용히
   *  정리하고 "cancelled"를, 실제 녹음 중이었다면 "stopped"를 돌려줍니다. */
  stop() {
    if (this.#warmupTimer) {
      clearTimeout(this.#warmupTimer);
      this.#warmupTimer = null;
      this.#releaseStream();
      this.callbacks.onPreparingChange?.(false);
      return "cancelled";
    }
    this.#mediaRecorder?.stop();
    return "stopped";
  }

  dispose() {
    if (this.#warmupTimer) clearTimeout(this.#warmupTimer);
    this.#warmupTimer = null;
    this.#releaseStream();
  }

  #releaseStream() {
    this.#stream?.getTracks().forEach((t) => t.stop());
    this.#stream = null;
  }
}
