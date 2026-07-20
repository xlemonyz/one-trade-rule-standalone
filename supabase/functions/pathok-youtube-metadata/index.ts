import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function videoIdFromUrl(value: string) {
  try {
    const url = new URL(value);
    let id: string | null = null;
    if (url.hostname === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname.endsWith("youtube.com")) id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)?.[1] ?? null;
    return /^[\w-]{11}$/.test(id ?? "") ? id : null;
  } catch { return null; }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });
  const authorization = request.headers.get("Authorization") ?? "";
  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return jsonResponse(401, { error: "Sign in to load YouTube details." });

  try {
    const body = await request.json();
    const videoId = videoIdFromUrl(String(body?.url ?? ""));
    if (!videoId) return jsonResponse(400, { error: "Paste a valid YouTube video link." });
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`);
    if (!response.ok) return jsonResponse(404, { error: "This YouTube video is unavailable or private." });
    const metadata = await response.json();
    return jsonResponse(200, {
      videoId,
      canonicalUrl,
      title: String(metadata.title ?? "YouTube video"),
      thumbnailUrl: String(metadata.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
    });
  } catch {
    return jsonResponse(503, { error: "Could not load YouTube details. Try again." });
  }
});
