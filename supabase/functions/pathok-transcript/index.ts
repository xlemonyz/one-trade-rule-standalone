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

function transcriptText(content: unknown): string {
  const raw = typeof content === "string"
    ? content
    : Array.isArray(content)
    ? content.map((item) => typeof item === "string" ? item : String(item?.text ?? "")).join(" ")
    : "";
  return raw.replace(/\s+/g, " ").trim();
}

function normalizedResult(payload: Record<string, unknown>) {
  const text = transcriptText(payload.content ?? payload.transcript ?? payload.text);
  if (text) {
    return { status: "READY", transcript: text, language: payload.lang ?? payload.language ?? null };
  }
  const jobId = String(payload.jobId ?? payload.job_id ?? "");
  const rawStatus = String(payload.status ?? "").toLowerCase();
  if (jobId || ["queued", "pending", "processing", "in_progress"].includes(rawStatus)) {
    return { status: "PROCESSING", jobId: jobId || null };
  }
  if (["failed", "error"].includes(rawStatus)) {
    return { status: "FAILED", error: String(payload.error ?? payload.message ?? "Transcript generation failed.") };
  }
  return { status: "FAILED", error: "No transcript is available for this video." };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const authorization = request.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonResponse(401, { error: "Sign in to generate a transcript." });

  const apiKey = Deno.env.get("SUPADATA_API_KEY") ?? "";
  if (!apiKey) return jsonResponse(503, { error: "Transcript service is not configured." });

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "start");
    let url: URL;
    if (action === "status") {
      const jobId = String(body.jobId ?? "");
      if (!jobId) return jsonResponse(400, { error: "Transcript job ID is required." });
      url = new URL(`https://api.supadata.ai/v1/transcript/${encodeURIComponent(jobId)}`);
    } else {
      const videoUrl = String(body.url ?? "");
      if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(videoUrl)) {
        return jsonResponse(400, { error: "A valid YouTube URL is required." });
      }
      url = new URL("https://api.supadata.ai/v1/transcript");
      url.searchParams.set("url", videoUrl);
      url.searchParams.set("text", "true");
      url.searchParams.set("mode", "auto");
    }

    const providerResponse = await fetch(url, { headers: { "x-api-key": apiKey } });
    const payload = await providerResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (!providerResponse.ok) {
      return jsonResponse(providerResponse.status, {
        error: String(payload.message ?? payload.error ?? "Transcript provider request failed."),
      });
    }
    return jsonResponse(200, normalizedResult(payload));
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : "Transcript request failed." });
  }
});
