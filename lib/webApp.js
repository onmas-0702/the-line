// 웹앱(PWA) 설정 — 휴대폰 "홈 화면에 추가" 후 아이콘으로 열면 주소창 없이 플랫폼 화면만
// 꽉 차게 보입니다. 일반 브라우저 탭에서는 보안 정책상 주소창을 숨길 수 없어서, 처음 들어온
// 모바일 사용자에게 InstallPrompt로 홈 화면 추가를 안내합니다(브라우저별 단계는 InstallGuide).

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

/** 지금 쓰는 휴대폰·브라우저 판별 — 홈 화면 추가 방법이 브라우저마다 달라서 필요합니다. */
export class BrowserEnvironment {
  // 앱 안에서 열린 화면(인앱 브라우저)에는 "홈 화면에 추가"가 없습니다.
  static #IN_APPS = [
    { pattern: /KAKAOTALK/i, name: "카카오톡", id: "kakaotalk" },
    { pattern: /NAVER\(inapp|NAVER/i, name: "네이버", id: "naver" },
    { pattern: /Instagram/i, name: "인스타그램", id: "instagram" },
    { pattern: /FBAN|FBAV|FB_IAB/i, name: "페이스북", id: "facebook" },
    { pattern: /\bLine\//i, name: "라인", id: "line" },
    { pattern: /DaumApps/i, name: "다음", id: "daum" },
    { pattern: /everytimeApp/i, name: "에브리타임", id: "everytime" },
    { pattern: /BAND\//i, name: "밴드", id: "band" },
  ];

  constructor(win = window) {
    const ua = win.navigator.userAgent || "";
    // iPadOS는 데스크톱 Safari처럼 보이므로 터치 지원 여부로 함께 판별합니다.
    this.isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && win.navigator.maxTouchPoints > 1);
    this.isAndroid = /Android/.test(ua);
    this.isMobile = this.isIOS || this.isAndroid || Boolean(win.matchMedia?.("(pointer: coarse)").matches);
    this.inApp = BrowserEnvironment.#IN_APPS.find((app) => app.pattern.test(ua)) || null;
    this.browser = this.inApp
      ? "inapp"
      : /SamsungBrowser/.test(ua)
        ? "samsung"
        : /CriOS/.test(ua)
          ? "chrome-ios"
          : /FxiOS|EdgiOS|Whale/.test(ua) && this.isIOS
            ? "other-ios"
            : this.isIOS
              ? "safari"
              : /Chrome/.test(ua)
                ? "chrome"
                : "other";
  }
}

/** 브라우저별 "홈 화면에 추가" 안내 — 번호 붙인 단계 + (가능하면) 바로 실행 버튼.
 *  step.icon은 화면에서 그림으로 바꿔 보여주는 이름입니다(InstallBanner 참고). */
export class InstallGuide {
  constructor({ title, intro = "", steps = [], action = null, tip = "" }) {
    this.title = title;
    this.intro = intro;
    this.steps = steps; // [{ icon, text }]
    this.action = action; // { kind: "install" | "open-external" | "copy-url", label }
    this.tip = tip;
  }

  static for(env, { canInstallDirectly = false } = {}) {
    if (env.inApp) return InstallGuide.#inApp(env);
    if (canInstallDirectly) {
      return new InstallGuide({
        title: "버튼 한 번으로 설치할 수 있어요",
        intro: "아래 버튼을 누르고, 나오는 창에서 \"설치\"를 누르면 끝이에요.",
        action: { kind: "install", label: "앱으로 설치하기" },
      });
    }
    switch (env.browser) {
      case "safari":
        return new InstallGuide({
          title: "iPhone Safari에서 홈 화면에 추가하기",
          steps: [
            { icon: "share", text: "화면 아래(또는 위) 주소 막대에서 공유 버튼을 눌러요. 공유 버튼이 안 보이면 ⋯ 버튼을 누른 뒤 \"공유\"를 눌러요." },
            { icon: "scroll", text: "나온 목록을 위로 밀어 올리며 아래쪽을 살펴보세요." },
            { icon: "plus", text: "\"홈 화면에 추가\"를 눌러요." },
            { icon: "check", text: "오른쪽 위 \"추가\"를 누르면 홈 화면에 \"더 라인\" 아이콘이 생겨요." },
          ],
          tip: "목록에 없으면 맨 아래 \"작업 편집…\"에서 \"홈 화면에 추가\"를 켜 주세요.",
        });
      case "chrome-ios":
        return new InstallGuide({
          title: "iPhone Chrome에서 홈 화면에 추가하기",
          steps: [
            { icon: "share", text: "주소창 오른쪽의 공유 버튼을 눌러요." },
            { icon: "scroll", text: "목록을 아래로 내려 보세요." },
            { icon: "plus", text: "\"홈 화면에 추가\"를 누르고 \"추가\"를 눌러요." },
          ],
          tip: "목록에 없으면 Safari에서 이 주소를 열어 주세요.",
          action: { kind: "copy-url", label: "주소 복사하기" },
        });
      case "samsung":
        return new InstallGuide({
          title: "삼성 인터넷에서 홈 화면에 추가하기",
          steps: [
            { icon: "menu", text: "화면 아래 오른쪽의 ≡ 메뉴를 눌러요." },
            { icon: "plus", text: "\"현재 페이지 추가\"를 눌러요." },
            { icon: "check", text: "\"홈 화면\"을 고르면 아이콘이 생겨요." },
          ],
        });
      case "chrome":
        return new InstallGuide({
          title: "Chrome에서 홈 화면에 추가하기",
          steps: [
            { icon: "more", text: "오른쪽 위 ⋮ 메뉴를 눌러요." },
            { icon: "plus", text: "\"홈 화면에 추가\" 또는 \"앱 설치\"를 눌러요." },
            { icon: "check", text: "\"설치\"(또는 \"추가\")를 누르면 아이콘이 생겨요." },
          ],
        });
      default:
        return new InstallGuide({
          title: "홈 화면에 추가하기",
          intro: env.isIOS
            ? "이 브라우저에서는 메뉴가 다를 수 있어요. Safari에서 열면 가장 쉽게 추가할 수 있어요."
            : "이 브라우저에서는 메뉴가 다를 수 있어요. Chrome에서 열면 가장 쉽게 추가할 수 있어요.",
          steps: [{ icon: "more", text: "브라우저 메뉴에서 \"홈 화면에 추가\" 또는 \"앱 설치\"를 찾아 눌러요." }],
          action: { kind: "copy-url", label: "주소 복사하기" },
        });
    }
  }

  static #inApp(env) {
    const target = env.isIOS ? "Safari" : "Chrome";
    const withTarget = env.isIOS ? "Safari로" : "Chrome으로";
    const intro = `지금은 ${env.inApp.name} 앱 안에서 열려 있어서 "홈 화면에 추가"가 없어요. ${target}에서 다시 열어 주세요.`;
    if (env.inApp.id === "kakaotalk" || env.isAndroid) {
      return new InstallGuide({
        title: `${target}에서 열어 주세요`,
        intro,
        action: { kind: "open-external", label: `${withTarget} 열기` },
        tip: `${target}에서 열리면 이 안내가 다시 나와요. 거기서 홈 화면에 추가할 수 있어요.`,
      });
    }
    return new InstallGuide({
      title: "Safari에서 열어 주세요",
      intro,
      steps: [
        { icon: "more", text: `${env.inApp.name} 화면 오른쪽 위(또는 아래)의 ⋯ 버튼을 눌러요.` },
        { icon: "external", text: "\"Safari로 열기\" 또는 \"다른 브라우저로 열기\"를 눌러요." },
      ],
      action: { kind: "copy-url", label: "주소 복사하기" },
      tip: "메뉴가 없으면 \"주소 복사하기\"를 누른 뒤 Safari 주소창에 붙여넣어 주세요.",
    });
  }
}

/** 홈 화면 추가 안내 상태 — 설치 여부, 닫음 기록, 안드로이드 바로 설치, 바깥 브라우저로 열기. */
export class InstallPrompt {
  static #DISMISS_KEY = "the-line:install-prompt-dismissed-at";
  static #SNOOZE_DAYS = 14;
  /** 다른 화면(예: 랜딩 하단 링크)에서 안내를 다시 열 때 보내는 이벤트 이름. */
  static OPEN_EVENT = "the-line:open-install-guide";

  #deferredEvent = null; // 안드로이드 Chrome의 beforeinstallprompt 이벤트

  constructor(win = window) {
    this.window = win;
    this.env = new BrowserEnvironment(win);
  }

  static requestOpen(win = window) {
    win.dispatchEvent(new Event(InstallPrompt.OPEN_EVENT));
  }

  get isMobile() {
    return this.env.isMobile;
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

  /** 처음 들어왔을 때 안내를 보여줄지 — 모바일이고, 아직 설치 안 했고, 최근에 닫지 않았을 때만. */
  get shouldShow() {
    return this.isMobile && !this.isStandalone && !this.isDismissed;
  }

  /** 안내를 다시 열 수 있는지(랜딩 하단 링크) — 모바일이고 아직 설치 안 했을 때. */
  get canShowGuide() {
    return this.isMobile && !this.isStandalone;
  }

  get guide() {
    return InstallGuide.for(this.env, { canInstallDirectly: this.#deferredEvent !== null });
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

  /** 안내의 버튼(action)을 실행합니다. 결과 문구(없으면 null)를 돌려줍니다. */
  async run(action) {
    if (action.kind === "install") return (await this.#install()) ? "installed" : null;
    if (action.kind === "open-external") {
      this.window.location.href = this.#externalBrowserUrl();
      return null;
    }
    if (action.kind === "copy-url") {
      try {
        await this.window.navigator.clipboard.writeText(this.window.location.href);
        return "copied";
      } catch (e) {
        return "copy-failed";
      }
    }
    return null;
  }

  async #install() {
    if (!this.#deferredEvent) return false;
    const event = this.#deferredEvent;
    this.#deferredEvent = null;
    await event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === "accepted";
  }

  /** 앱 안 브라우저에서 바깥 브라우저로 여는 주소 — 카카오톡은 전용 주소, 안드로이드는 Chrome. */
  #externalBrowserUrl() {
    const { href, host, pathname, search, hash } = this.window.location;
    if (this.env.inApp?.id === "kakaotalk") {
      return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
    }
    return `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  dismiss() {
    try {
      this.window.localStorage.setItem(InstallPrompt.#DISMISS_KEY, String(Date.now()));
    } catch (e) {
      // 저장 불가 — 이번 방문 동안만 닫힙니다.
    }
  }
}
