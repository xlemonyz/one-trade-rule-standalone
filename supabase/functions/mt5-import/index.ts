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

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeDirection(value: unknown) {
  const text = asText(value).toUpperCase();
  if (text === "BUY" || text === "SELL") return text;
  return "";
}

function parseDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatDateKey(parts: { year: number; month: number; day: number }) {
  const y = String(parts.year).padStart(4, "0");
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDateKey(dateKey: string, offsetDays: number) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const base = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + offsetDays, 12, 0, 0));
  return formatDateKey({
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  });
}

function parseTimeValue(value: string, fallback = "17:00") {
  const raw = asText(value || fallback);
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return parseTimeValue(fallback, "17:00");
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  const second = Math.max(0, Math.min(59, Number(match[3] || 0)));
  return { hour, minute, second };
}

function secondsOfDay(hour: number, minute: number, second = 0) {
  return hour * 3600 + minute * 60 + second;
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const raw = formatter.formatToParts(date);
  const parts: Record<string, string> = {};
  raw.forEach((item) => {
    if (item.type !== "literal") parts[item.type] = item.value;
  });
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const p = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(dateKey: string, timeValue: string, timeZone: string) {
  const dateParts = parseDateKey(dateKey);
  const timeParts = parseTimeValue(timeValue || "12:00");
  if (!dateParts) return null;

  const targetMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    0
  );

  let guess = targetMs;
  for (let i = 0; i < 4; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(guess), timeZone);
    const next = targetMs - offset;
    if (Math.abs(next - guess) < 1000) {
      guess = next;
      break;
    }
    guess = next;
  }
  return new Date(guess);
}

function safeIsoDate(isoLike: string) {
  const parsed = new Date(isoLike);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function hasValue(value: unknown) {
  return String(value ?? "").trim() !== "";
}

function parseEpochMs(raw: unknown) {
  if (!hasValue(raw)) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) return null;
  if (number <= 0) return null;
  return Math.trunc(number);
}

function parseIsoWithTimezone(raw: unknown) {
  const text = asText(raw);
  if (!text) return null;
  const hasTimezone = /(Z|[+-]\d{2}:\d{2})$/i.test(text);
  if (!hasTimezone) return null;
  return safeIsoDate(text);
}

function resolveExplicitCloseTimestamp(closeEpochMsRaw: unknown, closeTimeUtcRaw: unknown) {
  const closeEpochMs = parseEpochMs(closeEpochMsRaw);
  if (hasValue(closeEpochMsRaw)) {
    if (closeEpochMs === null) return { ok: false as const, reason: "INVALID_EXPLICIT_CLOSE_TIME" as const };
    const stamp = new Date(closeEpochMs);
    if (Number.isNaN(stamp.getTime())) return { ok: false as const, reason: "INVALID_EXPLICIT_CLOSE_TIME" as const };
    return {
      ok: true as const,
      stamp,
      source: "closeEpochMs" as const,
      closeEpochMs,
      closeTimeUtc: stamp.toISOString(),
    };
  }

  const closeTimeUtc = parseIsoWithTimezone(closeTimeUtcRaw);
  if (hasValue(closeTimeUtcRaw)) {
    if (!closeTimeUtc) return { ok: false as const, reason: "INVALID_EXPLICIT_CLOSE_TIME" as const };
    return {
      ok: true as const,
      stamp: closeTimeUtc,
      source: "closeTimeUtc" as const,
      closeEpochMs: closeTimeUtc.getTime(),
      closeTimeUtc: closeTimeUtc.toISOString(),
    };
  }

  return { ok: false as const, reason: "MISSING_EXPLICIT_CLOSE_TIME" as const };
}

function resolveOptionalExplicitTimestamp(epochRaw: unknown, isoRaw: unknown) {
  const epoch = parseEpochMs(epochRaw);
  if (hasValue(epochRaw)) {
    if (epoch === null) return { epochMs: null, isoUtc: null };
    const stamp = new Date(epoch);
    if (Number.isNaN(stamp.getTime())) return { epochMs: null, isoUtc: null };
    return { epochMs: epoch, isoUtc: stamp.toISOString() };
  }
  const parsedIso = parseIsoWithTimezone(isoRaw);
  if (hasValue(isoRaw)) {
    if (!parsedIso) return { epochMs: null, isoUtc: null };
    return { epochMs: parsedIso.getTime(), isoUtc: parsedIso.toISOString() };
  }
  return { epochMs: null, isoUtc: null };
}

function toDateAndTime(isoLike: string) {
  const parsed = safeIsoDate(isoLike);
  if (!parsed) return { date: "", time: "" };
  return {
    date: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`,
    time: `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`,
  };
}

function toUtcDateAndTime(stamp: Date) {
  if (!(stamp instanceof Date) || Number.isNaN(stamp.getTime())) return { date: "", time: "" };
  return {
    date: `${stamp.getUTCFullYear()}-${String(stamp.getUTCMonth() + 1).padStart(2, "0")}-${String(
      stamp.getUTCDate()
    ).padStart(2, "0")}`,
    time: `${String(stamp.getUTCHours()).padStart(2, "0")}:${String(stamp.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function getGoldTradingDayKey(stamp: Date, closeTime: string, closeTimezone: string) {
  const parts = getTimeZoneParts(stamp, closeTimezone);
  const localKey = formatDateKey({ year: parts.year, month: parts.month, day: parts.day });
  const nowSeconds = secondsOfDay(parts.hour, parts.minute, parts.second);
  const closeParts = parseTimeValue(closeTime || "17:00");
  const closeSeconds = secondsOfDay(closeParts.hour, closeParts.minute, closeParts.second);
  return nowSeconds >= closeSeconds ? shiftDateKey(localKey, 1) : localKey;
}

type ChallengeShape = {
  id?: string;
  status?: string;
  start_date?: string;
  created_at?: string;
  updated_at?: string;
  challenge_number?: number;
};

function resolveActiveChallenge(state: Record<string, unknown>) {
  const challenges = Array.isArray(state?.disciplineChallenges)
    ? (state.disciplineChallenges as ChallengeShape[])
    : [];
  const active = challenges
    .filter((item) => asText(item?.status).toUpperCase() === "ACTIVE")
    .sort((a, b) => Number(b?.challenge_number || 0) - Number(a?.challenge_number || 0))[0];
  if (!active?.id) return null;
  return active;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("APP_SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, error: "Server secrets missing" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: "Invalid JSON body" });
  }

  const apiKey = asText(payload.apiKey);
  const accountNumber = asText(payload.accountNumber);
  const brokerServer = asText(payload.brokerServer);
  const ticket = asText(payload.ticket);
  const symbol = asText(payload.symbol);
  const direction = normalizeDirection(payload.direction);
  const openTime = asText(payload.openTime);
  const closeTime = asText(payload.closeTime);
  const openTimeUtcRaw = payload.openTimeUtc;
  const closeTimeUtcRaw = payload.closeTimeUtc;
  const openEpochMsRaw = payload.openEpochMs;
  const closeEpochMsRaw = payload.closeEpochMs;
  const entryPrice = asNumber(payload.entryPrice);
  const closePrice = asNumber(payload.closePrice);
  const lotSize = asNumber(payload.lotSize);
  const profit = asNumber(payload.profit) ?? 0;
  const commission = asNumber(payload.commission) ?? 0;
  const swap = asNumber(payload.swap) ?? 0;
  const comment = asText(payload.comment);

  const missing: string[] = [];
  if (!apiKey) missing.push("apiKey");
  if (!accountNumber) missing.push("accountNumber");
  if (!ticket) missing.push("ticket");
  if (!symbol) missing.push("symbol");
  if (!direction) missing.push("direction");
  if (!openTime) missing.push("openTime");
  if (!closeTime) missing.push("closeTime");
  if (entryPrice === null) missing.push("entryPrice");
  if (closePrice === null) missing.push("closePrice");
  if (lotSize === null) missing.push("lotSize");
  if (missing.length) {
    return jsonResponse(400, { ok: false, error: `Missing/invalid fields: ${missing.join(", ")}` });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: connection, error: connectionError } = await supabase
    .from("broker_connections")
    .select("id, user_id, account_number, broker_name, api_key")
    .eq("api_key", apiKey)
    .maybeSingle();
  if (connectionError) return jsonResponse(500, { ok: false, error: connectionError.message });
  if (!connection) return jsonResponse(401, { ok: false, error: "Invalid API key" });
  if (!connection.user_id) return jsonResponse(401, { ok: false, error: "Connection has no user" });

  const savedAccount = asText(connection.account_number);
  if (savedAccount && savedAccount !== accountNumber) {
    return jsonResponse(403, { ok: false, error: "Account number mismatch for this API key" });
  }
  if (!savedAccount) {
    const { error: accountUpdateError } = await supabase
      .from("broker_connections")
      .update({ account_number: accountNumber })
      .eq("id", connection.id);
    if (accountUpdateError) return jsonResponse(500, { ok: false, error: accountUpdateError.message });
  }

  const importedAt = new Date().toISOString();
  const brokerServerForKey = brokerServer || "__missing__";

  const upsertRejectedTicket = async (reason: string) => {
    const { error: quarantineError } = await supabase.from("one_trade_rule_ticket_quarantine").upsert(
      {
        user_id: connection.user_id,
        broker_account_number: accountNumber,
        broker_server: brokerServerForKey,
        broker_ticket: ticket,
        reason,
        first_seen_at: importedAt,
        close_time: closeTime || null,
        raw_payload: payload,
      },
      { onConflict: "user_id,broker_account_number,broker_server,broker_ticket" }
    );
    if (quarantineError) {
      console.error(
        JSON.stringify({
          scope: "mt5-import",
          log: "[MT5 Import Gate]",
          decision: "quarantine_upsert_error",
          ticket,
          accountNumber,
          rejectCode: reason,
          error: quarantineError.message,
        })
      );
    }
  };

  const { data: quarantineHitExact, error: quarantineCheckErrorExact } = await supabase
    .from("one_trade_rule_ticket_quarantine")
    .select("id, reason")
    .eq("user_id", connection.user_id)
    .eq("broker_account_number", accountNumber)
    .eq("broker_server", brokerServerForKey)
    .eq("broker_ticket", ticket)
    .maybeSingle();
  if (quarantineCheckErrorExact) return jsonResponse(500, { ok: false, error: quarantineCheckErrorExact.message });

  let quarantineHit = quarantineHitExact;
  if (!quarantineHit?.id) {
    const { data: quarantineHitLegacy, error: quarantineCheckErrorLegacy } = await supabase
      .from("one_trade_rule_ticket_quarantine")
      .select("id, reason")
      .eq("user_id", connection.user_id)
      .eq("broker_account_number", accountNumber)
      .eq("broker_server", "__legacy__")
      .eq("broker_ticket", ticket)
      .maybeSingle();
    if (quarantineCheckErrorLegacy) return jsonResponse(500, { ok: false, error: quarantineCheckErrorLegacy.message });
    quarantineHit = quarantineHitLegacy;
  }

  if (quarantineHit?.id) {
    console.log(
      JSON.stringify({
        scope: "mt5-import",
        log: "[MT5 Import Gate]",
        ticket,
        accountNumber,
        brokerServer,
        closeEpochMs: String(closeEpochMsRaw ?? ""),
        closeTimeUtc: asText(closeTimeUtcRaw),
        selectedCloseTimestampSource: "",
        closeStampMs: 0,
        closeTime,
        activeChallengeFound: false,
        quarantineHit: true,
        rejectCode: "TICKET_BLOCKED_PREVIOUSLY_REJECTED",
        trading_day_key: "",
      })
    );
    return jsonResponse(409, {
      ok: false,
      code: "TICKET_BLOCKED_PREVIOUSLY_REJECTED",
      error: "This ticket was rejected before and is permanently blocked for challenge attach.",
    });
  }

  if (!brokerServer) {
    await upsertRejectedTicket("MISSING_BROKER_SERVER");
    console.log(
      JSON.stringify({
        scope: "mt5-import",
        log: "[MT5 Import Gate]",
        ticket,
        accountNumber,
        brokerServer,
        closeEpochMs: String(closeEpochMsRaw ?? ""),
        closeTimeUtc: asText(closeTimeUtcRaw),
        selectedCloseTimestampSource: "",
        closeStampMs: 0,
        closeTime,
        activeChallengeFound: false,
        quarantineHit: false,
        rejectCode: "MISSING_BROKER_SERVER",
        trading_day_key: "",
      })
    );
    return jsonResponse(409, {
      ok: false,
      code: "MISSING_BROKER_SERVER",
      error: "brokerServer is required for deterministic ticket scoping.",
    });
  }

  const explicitClose = resolveExplicitCloseTimestamp(closeEpochMsRaw, closeTimeUtcRaw);
  if (!explicitClose.ok) {
    await upsertRejectedTicket(explicitClose.reason);
    console.log(
      JSON.stringify({
        scope: "mt5-import",
        log: "[MT5 Import Gate]",
        ticket,
        accountNumber,
        brokerServer,
        closeEpochMs: String(closeEpochMsRaw ?? ""),
        closeTimeUtc: asText(closeTimeUtcRaw),
        selectedCloseTimestampSource: "",
        closeStampMs: 0,
        closeTime,
        activeChallengeFound: false,
        quarantineHit: false,
        rejectCode: explicitClose.reason,
        trading_day_key: "",
      })
    );
    return jsonResponse(409, {
      ok: false,
      code: explicitClose.reason,
      error:
        explicitClose.reason === "MISSING_EXPLICIT_CLOSE_TIME"
          ? "Provide closeEpochMs or closeTimeUtc."
          : "closeEpochMs/closeTimeUtc is invalid.",
    });
  }

  const parsedCloseTime = explicitClose.stamp;

  const { data: ruleStateRow, error: stateError } = await supabase
    .from("one_trade_rule_states")
    .select("data, state")
    .eq("user_id", connection.user_id)
    .maybeSingle();
  if (stateError) return jsonResponse(500, { ok: false, error: stateError.message });
  const statePayload = (ruleStateRow?.data || ruleStateRow?.state || {}) as Record<string, unknown>;
  const activeChallenge = resolveActiveChallenge(statePayload);
  if (!activeChallenge?.id) {
    await upsertRejectedTicket("NO_ACTIVE_CHALLENGE");
    console.log(
      JSON.stringify({
        scope: "mt5-import",
        log: "[MT5 Import Gate]",
        ticket,
        accountNumber,
        brokerServer,
        closeEpochMs: String(closeEpochMsRaw ?? ""),
        closeTimeUtc: asText(closeTimeUtcRaw),
        selectedCloseTimestampSource: explicitClose.source,
        closeStampMs: explicitClose.closeEpochMs,
        closeTime,
        activeChallengeFound: false,
        quarantineHit: false,
        rejectCode: "NO_ACTIVE_CHALLENGE",
        trading_day_key: "",
      })
    );
    return jsonResponse(409, {
      ok: false,
      code: "NO_ACTIVE_CHALLENGE",
      error: "No active challenge. Start challenge first, then sync MT5 trades.",
    });
  }

  const tradeGateMs = parsedCloseTime.getTime();
  const challengeStartRaw = asText(activeChallenge.created_at || activeChallenge.updated_at || "");
  const challengeStartMs = safeIsoDate(challengeStartRaw)?.getTime() || 0;
  if (challengeStartMs > 0 && tradeGateMs > 0 && tradeGateMs < challengeStartMs) {
    await upsertRejectedTicket("TRADE_BEFORE_CHALLENGE_START");
    console.log(
      JSON.stringify({
        scope: "mt5-import",
        log: "[MT5 Import Gate]",
        ticket,
        accountNumber,
        brokerServer,
        closeEpochMs: String(closeEpochMsRaw ?? ""),
        closeTimeUtc: asText(closeTimeUtcRaw),
        selectedCloseTimestampSource: explicitClose.source,
        closeStampMs: explicitClose.closeEpochMs,
        closeTime,
        activeChallengeFound: true,
        quarantineHit: false,
        rejectCode: "TRADE_BEFORE_CHALLENGE_START",
        trading_day_key: "",
      })
    );
    return jsonResponse(409, {
      ok: false,
      code: "TRADE_BEFORE_CHALLENGE_START",
      error: "Trade happened before this challenge started.",
      challenge_id: activeChallenge.id,
    });
  }

  const closeTimezone = asText(
    (statePayload?.disciplineMarketSettings as Record<string, unknown>)?.close_timezone || "America/New_York"
  );
  const closeTimeSetting = asText(
    (statePayload?.disciplineMarketSettings as Record<string, unknown>)?.close_time || "17:00"
  );
  const tradingDayKey = getGoldTradingDayKey(parsedCloseTime, closeTimeSetting, closeTimezone);

  const { data: duplicateRowExact, error: duplicateErrorExact } = await supabase
    .from("challenge_trades")
    .select("id")
    .eq("user_id", connection.user_id)
    .eq("broker_account_number", accountNumber)
    .eq("broker_server", brokerServer)
    .eq("broker_ticket", ticket)
    .limit(1)
    .maybeSingle();
  if (duplicateErrorExact) return jsonResponse(500, { ok: false, error: duplicateErrorExact.message });

  let duplicateRow = duplicateRowExact;
  if (!duplicateRow?.id) {
    const { data: duplicateLegacy, error: duplicateLegacyError } = await supabase
      .from("challenge_trades")
      .select("id")
      .eq("user_id", connection.user_id)
      .eq("broker_account_number", accountNumber)
      .eq("broker_server", "__legacy__")
      .eq("broker_ticket", ticket)
      .limit(1)
      .maybeSingle();
    if (duplicateLegacyError) return jsonResponse(500, { ok: false, error: duplicateLegacyError.message });
    duplicateRow = duplicateLegacy;
  }

  if (duplicateRow?.id) {
    console.log(
      JSON.stringify({
        scope: "mt5-import",
        log: "[MT5 Import Gate]",
        ticket,
        accountNumber,
        brokerServer,
        closeEpochMs: String(closeEpochMsRaw ?? ""),
        closeTimeUtc: asText(closeTimeUtcRaw),
        selectedCloseTimestampSource: explicitClose.source,
        closeStampMs: explicitClose.closeEpochMs,
        closeTime,
        activeChallengeFound: true,
        quarantineHit: false,
        rejectCode: "DUPLICATE_SKIP",
        trading_day_key: tradingDayKey,
      })
    );
    await supabase.from("broker_connections").update({ last_sync_at: importedAt }).eq("id", connection.id);
    return jsonResponse(200, { ok: true, status: "duplicate" });
  }

  const closeDateTime = toUtcDateAndTime(parsedCloseTime);
  if (!closeDateTime.date) return jsonResponse(400, { ok: false, error: "Invalid closeTime" });
  const openExplicit = resolveOptionalExplicitTimestamp(openEpochMsRaw, openTimeUtcRaw);

  const netPnl = profit + commission + swap;
  const tradeData = {
    id: `trade-mt5-${accountNumber}-${ticket}`,
    date: closeDateTime.date,
    time: closeDateTime.time,
    pair: symbol,
    direction,
    entryPrice: String(entryPrice),
    closePrice: String(closePrice),
    lotSize: String(lotSize),
    pnl: Number(netPnl.toFixed(2)),
    outcome: "Manual",
    source: "mt5",
    brokerTicket: ticket,
    brokerAccountNumber: accountNumber,
    brokerServer,
    importedAt,
    trading_day_key: tradingDayKey,
    discipline_challenge_id: activeChallenge.id,
    challenge_id: activeChallenge.id,
    broker_trade_date: closeDateTime.date,
    broker_trade_time: closeDateTime.time,
    mt5OpenTime: openTime,
    mt5CloseTime: closeTime,
    openTimeUtc: openExplicit.isoUtc || null,
    closeTimeUtc: explicitClose.closeTimeUtc,
    openEpochMs: openExplicit.epochMs,
    closeEpochMs: explicitClose.closeEpochMs,
    mt5Profit: profit,
    mt5Commission: commission,
    mt5Swap: swap,
    mt5Comment: comment,
    tradePlan: comment ? `Imported from MT5 EA\nComment: ${comment}` : "Imported from MT5 EA",
    setup: "MT5 Auto Sync",
  };

  const { error: insertError } = await supabase.from("challenge_trades").insert({
    user_id: connection.user_id,
    challenge_id: activeChallenge.id,
    trading_day_key: tradingDayKey,
    source: "mt5",
    data: tradeData,
    broker_ticket: ticket,
    broker_account_number: accountNumber,
    broker_server: brokerServer,
    broker_source: "MT5",
    open_time_utc: openExplicit.isoUtc,
    close_time_utc: explicitClose.closeTimeUtc,
    open_epoch_ms: openExplicit.epochMs,
    close_epoch_ms: explicitClose.closeEpochMs,
    imported_at: importedAt,
  });
  if (insertError) {
    if (insertError.code === "23505" || asText(insertError.message).toLowerCase().includes("duplicate")) {
      console.log(
        JSON.stringify({
          scope: "mt5-import",
          log: "[MT5 Import Gate]",
          ticket,
          accountNumber,
          brokerServer,
          closeEpochMs: String(closeEpochMsRaw ?? ""),
          closeTimeUtc: asText(closeTimeUtcRaw),
          selectedCloseTimestampSource: explicitClose.source,
          closeStampMs: explicitClose.closeEpochMs,
          closeTime,
          activeChallengeFound: true,
          quarantineHit: false,
          rejectCode: "DUPLICATE_SKIP_ON_INSERT",
          trading_day_key: tradingDayKey,
        })
      );
      await supabase.from("broker_connections").update({ last_sync_at: importedAt }).eq("id", connection.id);
      return jsonResponse(200, { ok: true, status: "duplicate" });
    }
    return jsonResponse(500, { ok: false, error: insertError.message });
  }

  const { error: syncError } = await supabase
    .from("broker_connections")
    .update({ last_sync_at: importedAt })
    .eq("id", connection.id);
  if (syncError) return jsonResponse(500, { ok: false, error: syncError.message });

  console.log(
    JSON.stringify({
      scope: "mt5-import",
      log: "[MT5 Import Gate]",
      ticket,
      accountNumber,
      brokerServer,
      closeEpochMs: String(closeEpochMsRaw ?? ""),
      closeTimeUtc: asText(closeTimeUtcRaw),
      selectedCloseTimestampSource: explicitClose.source,
      closeStampMs: explicitClose.closeEpochMs,
      closeTime,
      activeChallengeFound: true,
      quarantineHit: false,
      rejectCode: "",
      trading_day_key: tradingDayKey,
    })
  );

  return jsonResponse(200, {
    ok: true,
    status: "inserted",
    challenge_id: activeChallenge.id,
    trading_day_key: tradingDayKey,
  });
});
