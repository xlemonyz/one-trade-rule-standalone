export const PATHOK_KIND = Object.freeze({ TEXT: "TEXT", YOUTUBE: "YOUTUBE" });
export const TRANSCRIPT_STATUS = Object.freeze({
  NOT_GENERATED: "NOT_GENERATED",
  REQUESTED: "REQUESTED",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
});

export function normalizePathokDocument(row = {}) {
  return {
    userId: row.user_id || "",
    id: row.id || "",
    kind: row.kind === PATHOK_KIND.YOUTUBE ? PATHOK_KIND.YOUTUBE : PATHOK_KIND.TEXT,
    title: row.title || "",
    content: row.content || "",
    youtubeUrl: row.youtube_url || null,
    youtubeVideoId: row.youtube_video_id || null,
    thumbnailUrl: row.thumbnail_url || null,
    createdAt: Number(row.created_at_ms) || Date.now(),
    updatedAt: Number(row.updated_at_ms) || Date.now(),
    scrollIndex: Math.max(0, Number(row.scroll_index) || 0),
    scrollOffset: Math.max(0, Number(row.scroll_offset) || 0),
    deletedAt: row.deleted_at_ms == null ? null : Number(row.deleted_at_ms),
    originalTranscript: row.original_transcript || null,
    readableTranscript: row.readable_transcript || null,
    transcriptLanguage: row.transcript_language || null,
    transcriptStatus: Object.values(TRANSCRIPT_STATUS).includes(row.transcript_status)
      ? row.transcript_status
      : TRANSCRIPT_STATUS.NOT_GENERATED,
    transcriptError: row.transcript_error || null,
    transcriptScrollIndex: Math.max(0, Number(row.transcript_scroll_index) || 0),
    transcriptScrollOffset: Math.max(0, Number(row.transcript_scroll_offset) || 0),
  };
}

export function toPathokRow(document, userId) {
  return {
    user_id: userId,
    id: document.id,
    kind: document.kind,
    title: document.title || "",
    content: document.content || "",
    youtube_url: document.youtubeUrl || null,
    youtube_video_id: document.youtubeVideoId || null,
    thumbnail_url: document.thumbnailUrl || null,
    created_at_ms: document.createdAt,
    updated_at_ms: document.updatedAt,
    scroll_index: document.scrollIndex || 0,
    scroll_offset: document.scrollOffset || 0,
    deleted_at_ms: document.deletedAt ?? null,
    original_transcript: document.originalTranscript || null,
    readable_transcript: document.readableTranscript || null,
    transcript_language: document.transcriptLanguage || null,
    transcript_status: document.transcriptStatus || TRANSCRIPT_STATUS.NOT_GENERATED,
    transcript_job_id: null,
    transcript_scroll_index: document.transcriptScrollIndex || 0,
    transcript_scroll_offset: document.transcriptScrollOffset || 0,
    transcript_error: document.transcriptError || null,
  };
}

export function parseYouTubeVideoId(value) {
  try {
    const url = new URL(String(value || "").trim());
    let id = null;
    if (url.hostname === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0];
    if (url.hostname.endsWith("youtube.com")) {
      id = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
    }
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  } catch {
    return null;
  }
}

export function splitReadingText(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  const explicit = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (explicit.length > 1) return explicit;
  return text.match(/[^.!?।]+[.!?।]+|[^.!?।]+$/g)?.map((part) => part.trim()).filter(Boolean) || [text];
}

export function filterPathokDocuments(documents, query, kind = "ALL") {
  const needle = String(query || "").trim().toLocaleLowerCase();
  return documents
    .filter((document) => !document.deletedAt)
    .filter((document) => kind === "ALL" || document.kind === kind)
    .filter((document) => !needle || `${document.title} ${document.content}`.toLocaleLowerCase().includes(needle))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}
