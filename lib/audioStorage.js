"use client";

// Real persistence layer for audio nanum + background music, backed by
// Supabase Storage + Postgres. Every function returns { ok, ... } instead
// of throwing, and reports { ok:false, reason:"not-configured" } when
// Supabase isn't set up yet — callers use that to fall back to the old
// local-only (blob URL / localStorage) behavior.

import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Supabase Storage object keys only allow a restricted ASCII character set —
// uploading a file whose original name has Korean characters, spaces, or
// other symbols in it (e.g. "창문을 여는 시간.wav") fails with "Invalid key".
// We never need the original name in the storage path itself (it's already
// kept in the DB row as audio_file_name / script_file_name for display), so
// we build storage paths from a safe fixed name + the file's extension only.
function safeStorageExtension(fileName) {
  const dotIndex = (fileName || "").lastIndexOf(".");
  const rawExt = dotIndex >= 0 ? fileName.slice(dotIndex) : "";
  const cleaned = rawExt.replace(/[^a-zA-Z0-9.]/g, "");
  return cleaned || "";
}

/** Upload a finished audio mix (+ optional script file) and insert its
 *  searchable metadata row. */
export async function uploadAudioRecord({ wavBlob, scriptFile, metadata }) {
  if (!isSupabaseConfigured) return { ok: false, reason: "not-configured" };

  const id = randomId();
  const audioPath = `audios/${id}/mix.wav`;

  const { error: audioErr } = await supabase.storage
    .from("audio")
    .upload(audioPath, wavBlob, { contentType: "audio/wav", upsert: false });
  if (audioErr) return { ok: false, reason: audioErr.message };

  const { data: audioUrlData } = supabase.storage.from("audio").getPublicUrl(audioPath);

  let scriptUrl = null;
  if (scriptFile) {
    const scriptExt = safeStorageExtension(scriptFile.name);
    const scriptPath = `audios/${id}/script${scriptExt}`;
    const { error: scriptErr } = await supabase.storage
      .from("audio")
      .upload(scriptPath, scriptFile, { upsert: false });
    if (!scriptErr) {
      const { data } = supabase.storage.from("audio").getPublicUrl(scriptPath);
      scriptUrl = data.publicUrl;
    }
  }

  const row = {
    id,
    title: metadata.title,
    pastor_name: metadata.pastorName || null,
    church: metadata.church || null,
    scripture_reference: metadata.scriptureReference || null,
    category: metadata.category || null,
    tags: metadata.tags || [],
    description: metadata.description || null,
    duration_seconds: metadata.durationSeconds || 0,
    audio_url: audioUrlData.publicUrl,
    audio_file_name: "mix.wav",
    has_script: Boolean(scriptUrl),
    script_url: scriptUrl,
    script_file_name: scriptFile?.name || null,
    source: metadata.source || "recorded",
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("audios")
    .insert(row)
    .select()
    .single();
  if (insertErr) return { ok: false, reason: insertErr.message };
  return { ok: true, row: inserted };
}

/** Fetch the shared audio feed, optionally full-text searched. */
export async function fetchAudios({ search } = {}) {
  if (!isSupabaseConfigured) return { ok: false, reason: "not-configured", rows: [] };
  let query = supabase.from("audios").select("*").order("created_at", { ascending: false });
  if (search) {
    query = query.textSearch("search_vector", search, { type: "websearch", config: "simple" });
  }
  const { data, error } = await query;
  if (error) return { ok: false, reason: error.message, rows: [] };
  return { ok: true, rows: data };
}

/** Upload a personal background-music file and register it. */
export async function uploadBackgroundTrack({ file, name, durationSeconds }) {
  if (!isSupabaseConfigured) return { ok: false, reason: "not-configured" };

  const id = randomId();
  const ext = safeStorageExtension(file.name);
  const path = `background/${id}/track${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("background-music")
    .upload(path, file, { upsert: false });
  if (uploadErr) return { ok: false, reason: uploadErr.message };

  const { data: urlData } = supabase.storage.from("background-music").getPublicUrl(path);

  const row = {
    id,
    name,
    audio_url: urlData.publicUrl,
    audio_file_name: file.name,
    duration_seconds: durationSeconds || 0,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("background_tracks")
    .insert(row)
    .select()
    .single();
  if (insertErr) return { ok: false, reason: insertErr.message };
  return { ok: true, row: inserted };
}

export async function fetchBackgroundTracks() {
  if (!isSupabaseConfigured) return { ok: false, reason: "not-configured", rows: [] };
  const { data, error } = await supabase
    .from("background_tracks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, reason: error.message, rows: [] };
  return { ok: true, rows: data };
}

export async function deleteBackgroundTrack(id) {
  if (!isSupabaseConfigured) return { ok: false, reason: "not-configured" };
  const { error } = await supabase.from("background_tracks").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
