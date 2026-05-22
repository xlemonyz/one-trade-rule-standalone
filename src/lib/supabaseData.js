import { supabase } from "./supabaseClient.js";

export async function loadOneTradeState(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("one_trade_rule_states")
    .select("data, state")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.data || data?.state || null;
}

export async function saveOneTradeState(userId, state) {
  if (!userId) return;
  const payload = {
    user_id: userId,
    data: state,
    state,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("one_trade_rule_states").upsert(payload, {
    onConflict: "user_id",
  });
  if (error) throw error;
}

export async function loadBrokerConnection(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("broker_connections")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function saveBrokerConnection(userId, payload) {
  if (!userId) return null;
  const now = new Date().toISOString();
  const next = {
    user_id: userId,
    broker_name: String(payload?.broker_name || "").trim(),
    account_number: String(payload?.account_number || "").trim(),
    api_key: String(payload?.api_key || "").trim(),
    api_key_masked: String(payload?.api_key_masked || "").trim(),
    endpoint_url: String(payload?.endpoint_url || "").trim(),
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("broker_connections")
    .upsert(next, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || next;
}

export async function loadChallengeTrades(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("challenge_trades")
    .select("*")
    .eq("user_id", userId)
    .order("imported_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
