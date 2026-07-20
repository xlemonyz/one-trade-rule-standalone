import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function transcriptText(content: unknown) {
  const raw = typeof content === "string"
    ? content
    : Array.isArray(content)
    ? content.map((item) => typeof item === "string" ? item : String(item?.text ?? "")).join(" ")
    : "";
  return raw.replace(/\s+([,.;!?])/g, "$1").replace(/\s+/g, " ").trim();
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
    const videoUrl = String(body.url ?? "");
    const videoId = videoIdFromUrl(videoUrl);
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      return jsonResponse(400, { status: "FAILED", code: "INVALID_URL", error: "A valid YouTube URL is required." });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    if (body.forceRefresh !== true) {
      const { data: cached } = await admin.from("youtube_transcript_cache")
        .select("transcript,language").eq("video_id", videoId).limit(1).maybeSingle();
      if (cached) return jsonResponse(200, { status: "READY", ...cached, source: "cache" });
    }

    const apiKey = Deno.env.get("SUPADATA_API_KEY") ?? "";
    if (!apiKey) return jsonResponse(503, { status: "FAILED", code: "NOT_CONFIGURED", error: "Transcript service is not configured." });
    const providerUrl = new URL("https://api.supadata.ai/v1/transcript");
    providerUrl.searchParams.set("url", videoUrl);
    providerUrl.searchParams.set("text", "true");
    providerUrl.searchParams.set("mode", "native");
    const provider = await fetch(providerUrl, { headers: { "x-api-key": apiKey } });
    const payload = await provider.json().catch(() => ({})) as Record<string, unknown>;
    if (!provider.ok) {
      const noCaption = provider.status === 404 || provider.status === 422;
      return jsonResponse(provider.status, {
        status: "FAILED",
        code: noCaption ? "NO_CAPTIONS" : "PROVIDER_ERROR",
        error: noCaption ? "No public captions are available for this video." : String(payload.message ?? payload.error ?? "Transcript provider request failed."),
      });
    }
    const transcript = transcriptText(payload.content ?? payload.transcript ?? payload.text);
    if (!transcript) return jsonResponse(422, { status: "FAILED", code: "NO_CAPTIONS", error: "No public captions are available for this video." });
    const language = String(payload.lang ?? payload.language ?? "und");
    await admin.from("youtube_transcript_cache").upsert({
      video_id: videoId,
      language,
      source: "manual",
      transcript,
      fetched_at: new Date().toISOString(),
    }, { onConflict: "video_id,language" });
    return jsonResponse(200, { status: "READY", transcript, language, source: "native" });
  } catch {
    return jsonResponse(500, { status: "FAILED", code: "INTERNAL_ERROR", error: "Transcript request failed. Try again later." });
  }
});
