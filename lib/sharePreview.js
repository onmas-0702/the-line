// 링크 공유 미리보기(카카오톡·문자·SNS) — og:title · og:description · og:image 를 만듭니다.
// 카카오톡은 이 값들로 말풍선 아래 카드(그림 + 제목 + 설명)를 그립니다.
//   · 사이트 전체: 밤하늘 + 반달 + "은혜의 밤, The line" 그림(public/brand/og-default.jpg, 1200×630)
//   · 콘텐츠 화면: 그 콘텐츠의 제목 + 배경이미지(app/[channel]/content/[contentId]/opengraph-image.js가
//     카카오톡이 읽을 수 있는 JPG 1200×630으로 바꿔 줌. 배경이미지가 없으면 사이트 그림)
// 서버(레이아웃의 metadata)에서만 씁니다.

import { PLATFORM_TITLE } from "@/lib/mockData";
import { supabase } from "@/lib/supabaseClient";
import { WebAppBrand } from "@/lib/webApp";

export class SharePreview {
  static DEFAULT_IMAGE = Object.freeze({ url: "/brand/og-default.jpg", width: 1200, height: 630, alt: PLATFORM_TITLE });

  /** 미리보기 그림 주소를 절대 주소로 만들 기준. 도메인을 연결하면 NEXT_PUBLIC_SITE_URL에 넣어 주세요
   *  (없으면 Vercel의 대표 주소, 그것도 없으면 내 컴퓨터). */
  static siteUrl() {
    if (process.env.NEXT_PUBLIC_SITE_URL) return new URL(process.env.NEXT_PUBLIC_SITE_URL);
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
    return new URL(`http://localhost:${process.env.PORT || 3000}`);
  }

  /** 루트 레이아웃에 넣을 기본값. */
  static base() {
    return {
      metadataBase: SharePreview.siteUrl(),
      openGraph: SharePreview.#openGraph({ title: PLATFORM_TITLE, description: WebAppBrand.DESCRIPTION }),
      twitter: SharePreview.#twitter({ title: PLATFORM_TITLE, description: WebAppBrand.DESCRIPTION }),
    };
  }

  /** 공개된 콘텐츠의 미리보기 재료 — 로그인 없는 연결로 읽어서, 예약 중·비공개는 null. */
  static async loadContent(contentId) {
    if (!supabase) return null;
    const { data } = await supabase
      .from("audios")
      .select("title, description, cover_image_url")
      .eq("id", contentId)
      .maybeSingle();
    return data ? { title: data.title || "나눔", description: data.description || "", imageUrl: data.cover_image_url || "" } : null;
  }

  /** 콘텐츠 하나의 제목·설명. 그림은 같은 경로의 opengraph-image.js가 붙입니다. */
  static forContent({ title, description, path }) {
    const fullTitle = `${title} · ${PLATFORM_TITLE}`;
    const text = description || "목회자의 짧은 오디오 나눔을 들어 보세요.";
    return {
      openGraph: { type: "article", locale: "ko_KR", siteName: PLATFORM_TITLE, title: fullTitle, description: text, url: path },
      twitter: { card: "summary_large_image", title: fullTitle, description: text },
    };
  }

  /** 미리보기 그림(JPG 1200×630) — 콘텐츠 배경이미지를 가운데 기준으로 맞춰 자르고, 없거나 못 읽으면 사이트 그림. */
  static async contentImage(imageUrl) {
    const { default: sharp } = await import("sharp");
    const source = (imageUrl && (await SharePreview.#fetchBytes(imageUrl))) || null;
    if (source) {
      try {
        return await sharp(source).resize(1200, 630, { fit: "cover", position: "centre" }).jpeg({ quality: 84 }).toBuffer();
      } catch {
        // 깨진 이미지 — 아래 사이트 그림으로
      }
    }
    return SharePreview.#fetchBytes(new URL(SharePreview.DEFAULT_IMAGE.url, SharePreview.siteUrl()).toString());
  }

  static async #fetchBytes(url) {
    try {
      const res = await fetch(url);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }

  static #openGraph({ title, description, image = SharePreview.DEFAULT_IMAGE, url, type = "website" }) {
    return {
      type,
      locale: "ko_KR",
      siteName: PLATFORM_TITLE,
      title,
      description,
      images: [image],
      ...(url ? { url } : {}),
    };
  }

  static #twitter({ title, description, image = SharePreview.DEFAULT_IMAGE }) {
    return { card: "summary_large_image", title, description, images: [image.url] };
  }
}
