import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CaptionTrack = {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string; runs?: Array<{ text?: string }> };
};

class TranscriptError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function videoIdFromUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname.endsWith("youtube.com")) {
      return url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)?.[1] ?? null;
    }
  } catch { /* invalid URL */ }
  return null;
}

function balancedJsonAfter(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = source.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

function chooseTrack(tracks: CaptionTrack[]) {
  const score = (track: CaptionTrack) => {
    const language = (track.languageCode ?? "").toLowerCase();
    const english = language === "en" || language.startsWith("en-");
    const automatic = track.kind === "asr";
    if (english && !automatic) return 0;
    if (english && automatic) return 1;
    if (!automatic) return 2;
    return 3;
  };
  return [...tracks].sort((a, b) => score(a) - score(b))[0] ?? null;
}

function cleanTranscript(payload: Record<string, unknown>) {
  const events = Array.isArray(payload.events) ? payload.events : [];
  const chunks: string[] = [];
  let previous = "";
  for (const event of events as Array<Record<string, unknown>>) {
    const segments = Array.isArray(event.segs) ? event.segs : [];
    const text = segments
      .map((segment) => String((segment as Record<string, unknown>).utf8 ?? ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text === previous || /^\[(music|applause|laughter)\]$/i.test(text)) continue;
    chunks.push(text);
    previous = text;
  }
  return chunks.join(" ").replace(/\s+([,.;!?])/g, "$1").replace(/\s+/g, " ").trim();
}

async function extractTranscript(videoId: string) {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) throw new TranscriptError("YOUTUBE_BLOCKED", "YouTube is temporarily unavailable. Try again later.", 503);
  const html = await response.text();
  const rawPlayer = balancedJsonAfter(html, "ytInitialPlayerResponse")
    ?? balancedJsonAfter(html, '"playerResponse":');
  if (!rawPlayer) throw new TranscriptError("EXTRACTION_FAILED", "YouTube transcript data could not be read. Try again later.", 503);
  const player = JSON.parse(rawPlayer) as Record<string, any>;
  const playability = player.playabilityStatus?.status;
  if (playability && playability !== "OK") {
    throw new TranscriptError("VIDEO_UNAVAILABLE", String(player.playabilityStatus?.reason ?? "This video is unavailable."));
  }
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks as CaptionTrack[] | undefined;
  const track = chooseTrack(tracks ?? []);
  if (!track) throw new TranscriptError("NO_CAPTIONS", "No public captions are available for this video.");
  const captionUrl = new URL(track.baseUrl);
  captionUrl.searchParams.set("fmt", "json3");
  const captionResponse = await fetch(captionUrl);
  if (!captionResponse.ok) throw new TranscriptError("EXTRACTION_FAILED", "The public captions could not be downloaded.", 503);
  const transcript = cleanTranscript(await captionResponse.json());
  if (!transcript) throw new TranscriptError("NO_CAPTIONS", "The public caption track is empty.");
  return {
    transcript,
    language: track.languageCode ?? "und",
    source: track.kind === "asr" ? "auto" : "manual",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const authorization = request.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return jsonResponse(401, { status: "FAILED", code: "UNAUTHORIZED", error: "Sign in to generate a transcript." });

  try {
    const body = await request.json() as Record<string, unknown>;
    const videoId = videoIdFromUrl(String(body.url ?? ""));
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) throw new TranscriptError("INVALID_URL", "A valid YouTube URL is required.", 400);
    const forceRefresh = body.forceRefresh === true;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (!forceRefresh) {
      const { data: cached } = await admin
        .from("youtube_transcript_cache")
        .select("transcript,language,source")
        .eq("video_id", videoId)
        .order("language", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cached) return jsonResponse(200, { status: "READY", ...cached, source: "cache" });
    }

    const result = await extractTranscript(videoId);
    await admin.from("youtube_transcript_cache").upsert({
      video_id: videoId,
      language: result.language,
      source: result.source,
      transcript: result.transcript,
      fetched_at: new Date().toISOString(),
    }, { onConflict: "video_id,language" });
    return jsonResponse(200, { status: "READY", ...result });
  } catch (error) {
    if (error instanceof TranscriptError) {
      return jsonResponse(error.status, { status: "FAILED", code: error.code, error: error.message });
    }
    return jsonResponse(500, { status: "FAILED", code: "INTERNAL_ERROR", error: "Transcript extraction failed. Try again later." });
  }
});
