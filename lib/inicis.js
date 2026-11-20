// 서버 전용 — KG이니시스 정기결제(빌링) 연동. 키는 환경변수로만 받습니다(브라우저에 절대 노출 금지).
// 온마스 프로젝트에서 실제 결제로 검증한 방식을 그대로 따릅니다(2026-08~09 실측).
//   InicisConfig     — 상점 아이디·키
//   InicisTime       — 이니시스 시각 형식(항상 한국 시간 — Vercel 서버는 UTC라 직접 맞춤)
//   InicisBillingKey — 카드 등록(빌링키 발급) 창 값 만들기 · 결과 확인(서명 검증 + 빌링키 복호화)
//   InicisOneTimePay — 연간 1회 결제(일반결제 상점): 결제창 값 만들기 · 결과 승인 · 망취소
//   InicisApi        — 빌링키로 결제 승인, 결제 취소(전액·부분 환불 — 결제한 상점으로)
//   CardLabel        — 카드사 코드 + 번호 → "신한카드 ····1234"
// 규격: https://manual.inicis.com/pay/bill.html · cancel.html
//
// 환경변수(.env.local / Vercel):
//   INICIS_MID        정기결제(빌링)용 상점 아이디 — 테스트는 이니시스 공식 테스트 상점(INIBillTst)
//   INICIS_LITE_KEY   INILite Key  (가맹점관리자 ▶ 상점정보 ▶ 계약정보 ▶ KEY 정보) — 카드 등록·결과 확인
//   INICIS_API_KEY    INIAPI Key   (같은 곳) — 결제 승인·환불
//   INICIS_MODE       test | live  (표시용 — 테스트 상점 거래는 당일 자정에 이니시스가 자동 취소)
//   연간 1회 결제(일반결제 상점 — 정기결제 상점과 다른 MID):
//   INICIS_PAY_MID        일반결제 상점 아이디 — 테스트는 이니시스 테스트 상점(INIpayTest)
//   INICIS_PAY_HASH_KEY   모바일 금액위변조 Hash Key — 결제창 P_CHKFAKE(PC 결제창에도 이 키, 온마스 실측)
//   INICIS_PAY_API_KEY    그 상점의 INIAPI Key — 환불

import crypto from "node:crypto";

export class InicisConfig {
  static get mid() {
    return process.env.INICIS_MID || "";
  }
  static get liteKey() {
    return process.env.INICIS_LITE_KEY || "";
  }
  static get apiKey() {
    return process.env.INICIS_API_KEY || "";
  }
  static get isTest() {
    return process.env.INICIS_MODE !== "live";
  }
  static get isConfigured() {
    return Boolean(InicisConfig.mid && InicisConfig.liteKey && InicisConfig.apiKey);
  }
  /** 연간 1회 결제 상점 */
  static get payMid() {
    return process.env.INICIS_PAY_MID || "";
  }
  static get payHashKey() {
    return process.env.INICIS_PAY_HASH_KEY || "";
  }
  static get payApiKey() {
    return process.env.INICIS_PAY_API_KEY || "";
  }
  static get isOneTimeConfigured() {
    return Boolean(InicisConfig.payMid && InicisConfig.payHashKey && InicisConfig.payApiKey);
  }
  /** 결제한 방식(billing | onetime) → 그 상점의 아이디·INIAPI 키(환불에 씀) */
  static apiCredentials(method) {
    return method === "onetime"
      ? { mid: InicisConfig.payMid, apiKey: InicisConfig.payApiKey }
      : { mid: InicisConfig.mid, apiKey: InicisConfig.apiKey };
  }
  /** 일반결제창 스크립트(jQuery가 먼저 있어야 함) */
  static PAY_SDK_URL = "https://paypro.inicis.com/std/payment/js/INIPayPro_v2.js";
  static JQUERY_URL = "https://code.jquery.com/jquery-3.7.1.min.js";
  /** 카드 등록 창(PC·휴대폰 공용 — 팝업으로 엶) */
  static BILLING_KEY_URL = "https://inilitepay.inicis.com/pay/card/billing";
  /** 결제 승인·환불(테스트 상점도 같은 주소 — 상점 아이디로 구분) */
  static API_HOST = "https://iniapi.inicis.com";
}

export class InicisTime {
  /** "20261120143005" — 한국 시간(서버 시간대와 상관없이). 9시간 어긋나면 이니시스가 해시 오류로 거부합니다. */
  static stamp(date = new Date()) {
    const kst = new Date(date.getTime() + 9 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}${p(kst.getUTCHours())}${p(kst.getUTCMinutes())}${p(kst.getUTCSeconds())}`;
  }
}

class Hash {
  static sha512(text) {
    return crypto.createHash("sha512").update(text, "utf8").digest("hex");
  }
  static sha512Base64(text) {
    return crypto.createHash("sha512").update(text, "utf8").digest("base64");
  }
}

export class InicisBillingKey {
  /** 카드 등록 창으로 보낼 폼 값. hashData = SHA512(price + mid + orderId + timestamp + INILiteKey) */
  static formFields({ oid, price, goodName, buyerName, buyerEmail, buyerTel, returnUrl }) {
    const timestamp = InicisTime.stamp();
    const mid = InicisConfig.mid;
    return {
      mid,
      buyerTel,
      buyerEmail: InicisBillingKey.safeEmail(buyerEmail),
      buyerName,
      goodName,
      orderId: oid,
      price: String(price),
      timestamp,
      returnUrl,
      hashData: Hash.sha512(`${price}${mid}${oid}${timestamp}${InicisConfig.liteKey}`),
    };
  }

  /** '+'가 들어간 이메일 등은 이니시스가 거부해서 보내지 않습니다(선택 항목). */
  static safeEmail(email) {
    return /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(email || "")) ? email : "";
  }

  /** 결과 폼 본문(그대로의 문자열) → 값. 이니시스가 빌링키의 '+'를 인코딩하지 않고 보내는 경우가 있어서,
   *  표준 폼 해석('+' → 공백)을 쓰지 않고 %XX만 풉니다. */
  static parseBody(raw) {
    const fields = {};
    for (const pair of String(raw || "").split("&")) {
      if (!pair) continue;
      const i = pair.indexOf("=");
      const key = i === -1 ? pair : pair.slice(0, i);
      const value = i === -1 ? "" : pair.slice(i + 1);
      try {
        fields[decodeURIComponent(key)] = decodeURIComponent(value);
      } catch {
        fields[key] = value;
      }
    }
    return fields;
  }

  /** 빌링키 복호화 — AES-256-CBC, 키 = INILiteKey 문자열(32바이트), IV = 0으로 채운 16바이트. */
  static decrypt(encrypted) {
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(InicisConfig.liteKey, "utf8"), Buffer.alloc(16, 0));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
  }

  /** 결과 확인 → { ok, oid, billingKey, cardLabel, message }.
   *  응답 서명 hashData = SHA512(mid + orderId + tid + 복호화한 billkey + INILiteKey) */
  static verify(fields) {
    const oid = fields.orderId || "";
    if (fields.resultCode !== "SUCCESS") return { ok: false, oid, message: fields.resultMessage || "카드 등록이 취소됐어요." };
    if (fields.mid !== InicisConfig.mid) return { ok: false, oid, message: "상점 정보가 맞지 않아요." };
    let billingKey;
    try {
      billingKey = InicisBillingKey.decrypt(fields.billkey);
    } catch {
      return { ok: false, oid, message: "카드 등록 결과를 읽지 못했어요." };
    }
    const expected = Hash.sha512(`${fields.mid}${oid}${fields.tid}${billingKey}${InicisConfig.liteKey}`);
    if (expected !== fields.hashData) return { ok: false, oid, message: "카드 등록 결과 확인에 실패했어요." };
    return { ok: true, oid, billingKey, cardLabel: CardLabel.from(fields.cardCode, fields.cardNumber, fields.cardCompanyName), message: "" };
  }
}

export class InicisOneTimePay {
  /** 결제창(INIPayPro.requestPayment)에 넘길 값. P_CHKFAKE = base64(SHA512(금액 + 주문번호 + timestamp + HashKey)) */
  static requestParams({ oid, amount, goodName, buyerName, buyerEmail, nextUrl, closeUrl, deviceType = "WEB" }) {
    const timestamp = String(Date.now());
    const email = InicisBillingKey.safeEmail(buyerEmail);
    return {
      P_MID: InicisConfig.payMid,
      P_OID: oid,
      P_PAY_TYPE: "CARD",
      P_DEVICE_TYPE: deviceType,
      P_IDCCODE: "Y",
      P_AMT: amount,
      P_GOODS: goodName,
      P_UNAME: buyerName,
      P_NEXT_URL: nextUrl,
      P_CLOSE_URL: closeUrl,
      P_CHARSET: "UTF-8",
      P_TIMESTAMP: timestamp,
      P_CHKFAKE: Hash.sha512Base64(`${amount}${oid}${timestamp}${InicisConfig.payHashKey}`),
      P_RESERVED: JSON.stringify({ vbank_receipt: "N", bank_receipt: "N", ...(email ? { email } : {}) }),
    };
  }

  /** 승인 요청 호스트 — 결과의 P_IDCNAME(fc·ks·stg)만 허용 */
  static #host(idcName) {
    if (!/^(fc|ks|stg)$/.test(String(idcName || ""))) return null;
    return `https://${idcName}paypro.inicis.com`;
  }

  /** 응답은 JSON이 아니라 "key=value&…" 형식 */
  static #parse(text) {
    const out = {};
    for (const pair of String(text || "").split("&")) {
      const i = pair.indexOf("=");
      if (i === -1) continue;
      const value = pair.slice(i + 1);
      try {
        out[pair.slice(0, i)] = decodeURIComponent(value);
      } catch {
        out[pair.slice(0, i)] = value;
      }
    }
    return out;
  }

  static async #post(idcName, path, fields) {
    const host = InicisOneTimePay.#host(idcName);
    if (!host) return { P_STATUS: "HOST", P_RMESG: "결제 결과가 올바르지 않아요." };
    try {
      const response = await fetch(`${host}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: new URLSearchParams(fields).toString(),
        cache: "no-store",
      });
      return InicisOneTimePay.#parse(await response.text());
    } catch {
      return { P_STATUS: "NETWORK", P_RMESG: "이니시스와 연결하지 못했어요." };
    }
  }

  /** 인증 결과(P_STATUS 00) → 승인 → { ok, tid, message } */
  static async approve({ idcName, authTid, amount }) {
    const data = await InicisOneTimePay.#post(idcName, "/payment/v1/rest/payAppl.ini", {
      P_MID: InicisConfig.payMid,
      P_AUTH_TID: authTid,
      P_AMT: String(amount),
      P_CHARSET: "UTF-8",
    });
    if (data.P_STATUS !== "00") return { ok: false, message: data.P_RMESG || data.P_MESG || "결제 승인에 실패했어요." };
    return { ok: true, tid: data.P_APPL_TID || data.P_TID || authTid, cardLabel: CardLabel.from(data.P_FN_CD1 || data.P_CARD_ISSUER_CODE, data.P_CARD_NUM, data.P_FN_NM) };
  }

  /** 승인은 됐는데 우리 쪽 저장이 실패했을 때 되돌리기(인증 후 10분 안) */
  static async netCancel({ idcName, authTid, amount, oid }) {
    const timestamp = String(Date.now());
    await InicisOneTimePay.#post(idcName, "/payment/v1/rest/payNetCancel.ini", {
      P_MID: InicisConfig.payMid,
      P_AUTH_TID: authTid,
      P_AMT: String(amount),
      P_OID: oid,
      P_TIMESTAMP: timestamp,
      P_CHKFAKE: Hash.sha512Base64(`${amount}${oid}${timestamp}${InicisConfig.payHashKey}`),
      P_CHARSET: "UTF-8",
      P_CANCEL_MSG: "server_error_auto_cancel",
    });
  }
}

/** 서버 → 이니시스(폼 전송) → JSON 응답. */
async function postForm(path, fields) {
  try {
    const response = await fetch(`${InicisConfig.API_HOST}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams(fields).toString(),
      cache: "no-store",
    });
    return await response.json();
  } catch {
    return { resultCode: "NETWORK", resultMsg: "이니시스와 연결하지 못했어요." };
  }
}

export class InicisApi {
  /** 빌링키로 결제 → { ok, tid, message, raw }
   *  hashData = SHA512(INIAPIKey + type + paymethod + timestamp + clientIp + mid + moid + price + billKey) */
  static async charge({ oid, price, billingKey, goodName, buyerName, buyerEmail, buyerTel, siteUrl, clientIp }) {
    const type = "Billing";
    const paymethod = "Card";
    const timestamp = InicisTime.stamp();
    const mid = InicisConfig.mid;
    const ip = clientIp || "127.0.0.1";
    const result = await postForm("/api/v1/billing", {
      type,
      paymethod,
      timestamp,
      clientIp: ip,
      mid,
      url: siteUrl,
      moid: oid,
      goodName,
      buyerName,
      buyerEmail: InicisBillingKey.safeEmail(buyerEmail),
      buyerTel,
      price: String(price),
      billKey: billingKey,
      authentification: "00",
      hashData: Hash.sha512(`${InicisConfig.apiKey}${type}${paymethod}${timestamp}${ip}${mid}${oid}${price}${billingKey}`),
    });
    if (result.resultCode !== "00") return { ok: false, message: result.resultMsg || "결제에 실패했어요.", raw: result };
    return { ok: true, tid: result.tid, raw: result };
  }

  /** 전액 취소 — hashData = SHA512(INIAPIKey + type + paymethod + timestamp + clientIp + mid + tid) */
  static async refund({ tid, reason, clientIp, method = "billing" }) {
    const type = "Refund";
    const paymethod = "Card";
    const timestamp = InicisTime.stamp();
    const { mid, apiKey } = InicisConfig.apiCredentials(method);
    const ip = clientIp || "127.0.0.1";
    const result = await postForm("/api/v1/refund", {
      type,
      paymethod,
      timestamp,
      clientIp: ip,
      mid,
      tid,
      msg: String(reason || "환불").slice(0, 40),
      hashData: Hash.sha512(`${apiKey}${type}${paymethod}${timestamp}${ip}${mid}${tid}`),
    });
    return result.resultCode === "00" ? { ok: true } : { ok: false, message: result.resultMsg || "환불에 실패했어요." };
  }

  /** 부분 취소 — hashData = SHA512(INIAPIKey + type + paymethod + timestamp + clientIp + mid + tid + price + confirmPrice) */
  static async partialRefund({ tid, amount, remaining, reason, clientIp, method = "billing" }) {
    const type = "PartialRefund";
    const paymethod = "Card";
    const timestamp = InicisTime.stamp();
    const { mid, apiKey } = InicisConfig.apiCredentials(method);
    const ip = clientIp || "127.0.0.1";
    const result = await postForm("/api/v1/refund", {
      type,
      paymethod,
      timestamp,
      clientIp: ip,
      mid,
      tid,
      msg: String(reason || "부분 환불").slice(0, 40),
      price: String(amount),
      confirmPrice: String(remaining),
      currency: "WON",
      hashData: Hash.sha512(`${apiKey}${type}${paymethod}${timestamp}${ip}${mid}${tid}${amount}${remaining}`),
    });
    return result.resultCode === "00" ? { ok: true } : { ok: false, message: result.resultMsg || "부분 환불에 실패했어요." };
  }

  /** 영수증(매출전표) 보기 주소 — 이니시스 쪽에서 본인 확인을 한 번 더 합니다. */
  static receiptUrl(tid) {
    return `https://iniweb.inicis.com/receipt/iniReceipt.jsp?noTid=${encodeURIComponent(tid)}`;
  }
}

/** 카드사 코드 + 카드번호 → "신한카드 ····1234" (이름이 같이 오면 그 이름) */
export class CardLabel {
  static #NAMES = {
    "01": "하나카드", "03": "롯데카드", "04": "현대카드", "06": "KB국민카드", "11": "BC카드", "12": "삼성카드",
    "14": "신한카드", "16": "NH농협카드", "21": "해외비자", "22": "해외마스터", "23": "해외JCB", "26": "중국은련",
    "32": "광주카드", "33": "전북카드", "34": "하나카드", "41": "NH농협카드", "43": "씨티카드", "44": "우리카드",
    "48": "신협체크", "51": "수협카드", "52": "제주카드", "54": "MG새마을금고체크", "55": "케이뱅크카드",
    "56": "카카오뱅크", "71": "우체국체크", "95": "저축은행체크",
  };

  static from(code, number, name = "") {
    const label = name || CardLabel.#NAMES[String(code || "").padStart(2, "0")] || "카드";
    const digits = String(number || "").replace(/\D/g, "");
    return digits.length >= 4 ? `${label} ····${digits.slice(-4)}` : label;
  }
}
