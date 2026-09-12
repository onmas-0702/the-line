"use client";

// 사이트 전체 배경 스킨(이미지) 설정 — "제작/관리" 페이지의 "디자인 적용" 탭에서
// 씁니다. audioStorage.js와 같은 패턴: Supabase가 설정되어 있지 않으면
// { ok:false, reason:"not-configured" }를 돌려주고, 호출하는 쪽에서 이 브라우저만의
// 임시 미리보기로 대체합니다.

import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Supabase Storage 키는 한글·공백 등을 허용하지 않으므로(오디오 업로드 때와 동일한
// 이슈), 원본 파일명 대신 안전한 확장자만 붙여서 경로를 만듭니다.
function safeStorageExtension(fileName) {
  const dotIndex = (fileName || "").lastIndexOf(".");
  const rawExt = dotIndex >= 0 ? fileName.slice(dotIndex) : "";
  const cleaned = rawExt.replace(/[^a-zA-Z0-9.]/g, "");
  return cleaned || "";
}

/** 새 배경 스킨 이미지를 업로드하고 site_settings에 반영합니다. */
export async function uploadSkinImage(file) {
  if (!isSupabaseConfigured) return { ok: false, reason: "not-configured" };

  const id = randomId();
  const ext = safeStorageExtension(file.name);
  const path = `skin/${id}${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("site-design")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (uploadErr) return { ok: false, reason: uploadErr.message };

  const { data: urlData } = supabase.storage.from("site-design").getPublicUrl(path);

  const { error: updateErr } = await supabase
    .from("site_settings")
    .upsert({ id: "default", skin_image_url: urlData.publicUrl });
  if (updateErr) return { ok: false, reason: updateErr.message };

  return { ok: true, url: urlData.publicUrl };
}

/** 현재 적용된 배경 스킨 URL + 홈 화면 글자색을 가져옵니다. */
export async function fetchSkinImage() {
  if (!isSupabaseConfigured) return { ok: false, reason: "not-configured", url: null, textColor: null };
  const { data, error } = await supabase
    .from("site_settings")
    .select("skin_image_url, text_color")
    .eq("id", "default")
    .maybeSingle();
  if (error) return { ok: false, reason: error.message, url: null, textColor: null };
  return {
    ok: true,
    url: data?.skin_image_url || null,
    textColor: data?.text_color || null,
  };
}

/** 홈 화면 글자색을 바꿉니다(배경 이미지 위에서도 잘 읽히도록 관리자가 조절). */
export async function updateTextColor(color) {
  if (!isSupabaseConfigured) return { ok: false, reason: "not-configured" };
  const { error } = await supabase
    .from("site_settings")
    .upsert({ id: "default", text_color: color });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** 배경 스킨을 기본값(없음)으로 되돌립니다. 업로드된 파일 자체는 스토리지에
 *  남지만(정리는 나중 단계), site_settings의 참조만 지워서 즉시 화면에서 빠집니다. */
export async function clearSkinImage() {
  if (!isSupabaseConfigured) return { ok: false, reason: "not-configured" };
  const { error } = await supabase
    .from("site_settings")
    .upsert({ id: "default", skin_image_url: null });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
