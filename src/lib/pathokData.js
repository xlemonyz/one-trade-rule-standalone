import { supabase } from "./supabaseClient.js";
import { normalizePathokDocument, toPathokRow } from "./pathokModel.js";

export async function loadPathokDocuments(userId) {
  const { data, error } = await supabase
    .from("pathok_documents")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at_ms", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizePathokDocument);
}

export async function savePathokDocument(document, userId) {
  const { data, error } = await supabase
    .from("pathok_documents")
    .upsert(toPathokRow(document, userId), { onConflict: "user_id,id" })
    .select("*")
    .single();
  if (error) throw error;
  return normalizePathokDocument(data);
}

export async function patchPathokDocument(userId, documentId, fields) {
  const { data, error } = await supabase
    .from("pathok_documents")
    .update(fields)
    .eq("user_id", userId)
    .eq("id", documentId)
    .select("*")
    .single();
  if (error) throw error;
  return normalizePathokDocument(data);
}

export async function softDeletePathokDocument(userId, documentId) {
  const now = Date.now();
  return patchPathokDocument(userId, documentId, { deleted_at_ms: now, updated_at_ms: now });
}

export async function getYouTubeMetadata(url) {
  const { data, error } = await supabase.functions.invoke("pathok-youtube-metadata", { body: { url } });
  if (error) throw error;
  if (!data?.videoId) throw new Error(data?.error || "Could not load this YouTube video.");
  return data;
}

export async function generatePathokTranscript(url, forceRefresh = false) {
  const { data, error } = await supabase.functions.invoke("pathok-transcript", {
    body: { action: "start", url, forceRefresh },
  });
  if (error) {
    const context = await error.context?.json?.().catch(() => null);
    throw new Error(context?.error || error.message || "Transcript request failed.");
  }
  if (data?.status !== "READY") throw new Error(data?.error || "Transcript is unavailable.");
  return data;
}

export function subscribeToPathokDocuments(userId, onChange) {
  const channel = supabase
    .channel(`pathok-documents-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pathok_documents", filter: `user_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
