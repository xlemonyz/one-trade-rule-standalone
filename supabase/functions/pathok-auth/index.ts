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

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptJson(value: Record<string, unknown>, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

async function decryptJson(value: string, secret: string) {
  const [ivPart, encryptedPart] = value.split(".");
  if (!ivPart || !encryptedPart) throw new Error("Invalid encrypted session.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivPart) },
    await encryptionKey(secret),
    fromBase64Url(encryptedPart),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const supabaseUrl = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const handoffSecret = Deno.env.get("PATHOK_HANDOFF_SECRET") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || handoffSecret.length < 32) {
    return jsonResponse(500, { error: "Pathok auth handoff is not configured." });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  if (action === "create") {
    const authorization = request.headers.get("Authorization") || "";
    const accessToken = String(body?.accessToken || "");
    const refreshToken = String(body?.refreshToken || "");
    const codeChallenge = String(body?.codeChallenge || "");
    if (!authorization.startsWith("Bearer ") || authorization.slice(7) !== accessToken) {
      return jsonResponse(401, { error: "Invalid authenticated session." });
    }
    if (!refreshToken || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
      return jsonResponse(400, { error: "Invalid handoff request." });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData.user) return jsonResponse(401, { error: "Session is no longer valid." });

    const code = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const encryptedSession = await encryptJson({
      accessToken,
      refreshToken,
      userId: userData.user.id,
      email: userData.user.email || "",
    }, handoffSecret);
    const expiresAt = new Date(Date.now() + 90_000).toISOString();
    const { error } = await service.from("pathok_auth_handoffs").insert({
      code_hash: await sha256(code),
      user_id: userData.user.id,
      code_challenge: codeChallenge,
      encrypted_session: encryptedSession,
      expires_at: expiresAt,
    });
    if (error) return jsonResponse(500, { error: "Could not create login handoff." });

    await service.from("pathok_auth_handoffs").delete().lt("expires_at", new Date().toISOString());
    return jsonResponse(200, { code, expiresAt });
  }

  if (action === "exchange") {
    const code = String(body?.code || "");
    const codeVerifier = String(body?.codeVerifier || "");
    if (!code || codeVerifier.length < 43) return jsonResponse(400, { error: "Invalid exchange request." });

    const now = new Date().toISOString();
    const { data: row, error } = await service
      .from("pathok_auth_handoffs")
      .update({ consumed_at: now })
      .eq("code_hash", await sha256(code))
      .is("consumed_at", null)
      .gt("expires_at", now)
      .select("code_challenge, encrypted_session")
      .maybeSingle();
    if (error || !row) return jsonResponse(401, { error: "Login code is invalid or expired." });
    if (await sha256(codeVerifier) !== row.code_challenge) {
      return jsonResponse(401, { error: "Login verification failed." });
    }

    return jsonResponse(200, await decryptJson(row.encrypted_session, handoffSecret));
  }

  return jsonResponse(400, { error: "Unknown action." });
});
