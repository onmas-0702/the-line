// 웹앱(PWA) 설정 — 휴대폰 "홈 화면에 추가" 후 아이콘으로 열면 주소창 없이 플랫폼 화면만
// 꽉 차게 보입니다. 일반 브라우저 탭에서는 보안 정책상 주소창을 숨길 수 없어서, 처음 들어온
// 모바일 사용자에게 InstallPrompt로 홈 화면 추가를 안내합니다.

import { PLATFORM_NAME, PLATFORM_TITLE } from "@/lib/mockData";

/** 웹앱 이름·색·아이콘 — manifest, 아이콘 이미지, 메타데이터가 함께 씁니다. */
export class WebAppBrand {
  static NAME = PLATFORM_TITLE; // 설치 화면 등에 보이는 전체 이름
  static SHORT_NAME = PLATFORM_NAME; // 홈 화면 아이콘 아래 이름(짧게)
  static DESCRIPTION = "목회자를 위한 짧은 오디오 나눔 플랫폼";
  static THEME_COLOR = "#fafaf9"; // 상단 상태바 색(stone-50, 페이지 배경과 같게)
  static BACKGROUND_COLOR = "#fafaf9"; // 앱 시작 화면 배경
  static BRAND_COLOR = "#b45309"; // 아이콘 바탕(amber-700)

  /** 홈 화면·설치용 아이콘 크기(px). app/icon.js가 이 크기들로 그립니다. */
  static ICON_SIZES = [192, 512];
  static APPLE_ICON_SIZE = 180;

  static iconPath(size) {
    return `/icon/${size}`;
  }
}

/** 브라우저 환경 판별 + 홈 화면 추가 안내 상태. 브라우저에서만 만듭니다. */
export class InstallPrompt {
  static #DISMISS_KEY = "the-line:install-prompt-dismissed-at";
  static #SNOOZE_DAYS = 14;

  #deferredEvent = null; // 안드로이드 Chrome의 beforeinstallprompt 이벤트

  constructor(win = window) {
    this.window = win;
    const ua = win.navigator.userAgent || "";
    // iPadOS는 데스크톱 Safari처럼 보이므로 터치 지원 여부로 함께 판별합니다.
    this.isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && win.navigator.maxTouchPoints > 1);
    this.isAndroid = /Android/.test(ua);
    this.isMobile = this.isIOS || this.isAndroid || Boolean(win.matchMedia?.("(pointer: coarse)").matches);
  }

  /** 이미 홈 화면 아이콘으로(주소창 없이) 열려 있는지. */
  get isStandalone() {
    return Boolean(
      this.window.matchMedia?.("(display-mode: standalone)").matches ||
        this.window.matchMedia?.("(display-mode: fullscreen)").matches ||
        this.window.navigator.standalone
    );
  }

  get isDismissed() {
    try {
      const at = Number(this.window.localStorage.getItem(InstallPrompt.#DISMISS_KEY));
      return Boolean(at) && Date.now() - at < InstallPrompt.#SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    } catch (e) {
      return false;
    }
  }

  /** 안내를 보여줄지 — 모바일이고, 아직 설치 안 했고, 최근에 닫지 않았을 때만(컴퓨터는 제외). */
  get shouldShow() {
    return this.isMobile && !this.isStandalone && !this.isDismissed;
  }

  /** 버튼 한 번으로 설치할 수 있는지(안드로이드 Chrome 등). 아니면 안내 문구로 대신합니다. */
  get canInstallDirectly() {
    return this.#deferredEvent !== null;
  }

  /** 브라우저가 "설치할 수 있음"을 알려오면 이벤트를 붙잡아 둡니다. 해제 함수를 돌려줍니다. */
  listen(onChange) {
    const handleBeforeInstall = (event) => {
      event.preventDefault(); // 브라우저 기본 미니 안내 대신 우리 안내에서 버튼으로 띄웁니다.
      this.#deferredEvent = event;
      onChange();
    };
    const handleInstalled = () => {
      this.#deferredEvent = null;
      onChange();
    };
    this.window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    this.window.addEventListener("appinstalled", handleInstalled);
    return () => {
      this.window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      this.window.removeEventListener("appinstalled", handleInstalled);
    };
  }

  /** 설치 창을 띄웁니다. 설치했으면 true. */
  async install() {
    if (!this.#deferredEvent) return false;
    const event = this.#deferredEvent;
    this.#deferredEvent = null;
    await event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === "accepted";
  }

  dismiss() {
    try {
      this.window.localStorage.setItem(InstallPrompt.#DISMISS_KEY, String(Date.now()));
    } catch (e) {
      // 저장 불가 — 이번 방문 동안만 닫힙니다.
    }
  }
}
