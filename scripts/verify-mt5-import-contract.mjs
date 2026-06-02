import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index <= 0) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) return;
    process.env[key] = value;
  });
}

function normalizeImportUrl(rawUrl, supabaseUrl) {
  const direct = String(rawUrl || "").trim();
  if (direct) return direct.replace(/\/+$/, "");
  const parsed = new URL(supabaseUrl);
  const projectRef = parsed.hostname.split(".")[0];
  return `https://${projectRef}.functions.supabase.co/mt5-import`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function iso(ms) {
  return new Date(ms).toISOString();
}

async function main() {
  loadDotEnvFile(path.resolve(process.cwd(), ".env"));

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();
  const importUrl = normalizeImportUrl(process.env.MT5_IMPORT_URL, supabaseUrl);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing env. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or APP_SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = Date.now().toString(36);
  const accountNumber = process.env.MT5_TEST_ACCOUNT || `ACC-${runId}`;
  const brokerServer = process.env.MT5_TEST_BROKER_SERVER || "HFMarketsGlobal-Demo";
  const apiKey = process.env.MT5_TEST_API_KEY || `mt5_contract_${runId}`;
  const keepFixtures = String(process.env.KEEP_MT5_CONTRACT_FIXTURES || "").trim() === "1";
  const closeTimezone = "America/New_York";
  const closeTime = "17:00";
  const defaultChallengeStart = "2026-05-20T00:00:00.000Z";
  const blockedChallengeStart = "2026-05-22T00:00:00.000Z";
  const baseCloseMs = Date.parse("2026-05-21T20:30:00.000Z");
  const userEmail = `mt5-contract-${runId}@example.com`;
  const testPassword = `OneTrade!${runId.slice(-6)}aA9`;

  let userId = "";
  let caseCounter = 0;

  function nextTicket() {
    caseCounter += 1;
    return `ct-${runId}-${String(caseCounter).padStart(3, "0")}`;
  }

  function createPayload(overrides = {}) {
    const closeEpochMs =
      overrides.closeEpochMs === undefined ? baseCloseMs : overrides.closeEpochMs;
    const openEpochMs =
      overrides.openEpochMs === undefined && Number.isFinite(closeEpochMs)
        ? closeEpochMs - 120000
        : overrides.openEpochMs;

    const payload = {
      apiKey,
      accountNumber,
      brokerServer,
      ticket: overrides.ticket || nextTicket(),
      symbol: overrides.symbol || "XAUUSD",
      direction: overrides.direction || "BUY",
      openTime: overrides.openTime || "2026-05-21T16:28:00Z",
      closeTime: overrides.closeTime || "2026-05-21T16:30:00Z",
      entryPrice: overrides.entryPrice ?? 3340.1,
      closePrice: overrides.closePrice ?? 3341.2,
      lotSize: overrides.lotSize ?? 0.1,
      profit: overrides.profit ?? 9.2,
      commission: overrides.commission ?? -0.8,
      swap: overrides.swap ?? 0,
      comment: overrides.comment || "contract-test",
    };

    if (closeEpochMs !== undefined) payload.closeEpochMs = closeEpochMs;
    if (openEpochMs !== undefined) payload.openEpochMs = openEpochMs;
    if (overrides.closeTimeUtc !== undefined) payload.closeTimeUtc = overrides.closeTimeUtc;
    else if (Number.isFinite(closeEpochMs)) payload.closeTimeUtc = iso(closeEpochMs);
    if (overrides.openTimeUtc !== undefined) payload.openTimeUtc = overrides.openTimeUtc;
    else if (Number.isFinite(openEpochMs)) payload.openTimeUtc = iso(openEpochMs);

    if (overrides.brokerServer !== undefined) payload.brokerServer = overrides.brokerServer;
    if (overrides.closeEpochMs === null) delete payload.closeEpochMs;
    if (overrides.closeTimeUtc === null) delete payload.closeTimeUtc;
    if (overrides.openEpochMs === null) delete payload.openEpochMs;
    if (overrides.openTimeUtc === null) delete payload.openTimeUtc;

    return payload;
  }

  async function callImport(payload) {
    const response = await fetch(importUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { status: response.status, body };
  }

  async function ensureBrokerConnection() {
    const masked = apiKey.length <= 10 ? `${apiKey.slice(0, 2)}****` : `${apiKey.slice(0, 6)}******${apiKey.slice(-4)}`;
    const { error } = await supabase.from("broker_connections").upsert(
      {
        user_id: userId,
        broker_name: "MT5 Contract Broker",
        account_number: accountNumber,
        api_key: apiKey,
        api_key_masked: masked,
        endpoint_url: importUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) throw new Error(`broker_connections upsert failed: ${error.message}`);
  }

  async function setRuleState({ active, challengeCreatedAt }) {
    const challenge = active
      ? [
          {
            id: `challenge-${runId}`,
            status: "ACTIVE",
            target_clean_days: 10,
            completed_clean_days: 0,
            current_streak: 0,
            rule_breaks: 0,
            challenge_number: 1,
            restart_on_break: true,
            start_date: "2026-05-20",
            created_at: challengeCreatedAt || defaultChallengeStart,
            updated_at: challengeCreatedAt || defaultChallengeStart,
          },
        ]
      : [];

    const state = {
      id: `one-trade-rule-${userId}`,
      user_id: userId,
      disciplineModeEnabled: true,
      disciplineChallengeType: "ONE_TRADE_DISCIPLINE",
      disciplineMarketSettings: {
        market_symbol: "XAUUSD",
        close_mode: "GOLD_MARKET_CLOSE",
        close_time: closeTime,
        close_timezone: closeTimezone,
        weekend_closed: true,
        auto_finalize_enabled: true,
      },
      disciplineChallenges: challenge,
      disciplineDays: [],
      dailyCommitments: [],
      disciplineJournalTrades: [],
      disciplineTradeEvents: [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("one_trade_rule_states").upsert(
      {
        user_id: userId,
        data: state,
        state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) throw new Error(`one_trade_rule_states upsert failed: ${error.message}`);
  }

  async function clearTestRows() {
    const deletes = [
      supabase.from("challenge_trades").delete().eq("user_id", userId),
      supabase.from("one_trade_rule_ticket_quarantine").delete().eq("user_id", userId),
    ];
    const results = await Promise.all(deletes);
    const firstError = results.find((item) => item.error)?.error;
    if (firstError) throw new Error(`cleanup rows failed: ${firstError.message}`);
  }

  async function fetchTrade(ticket) {
    const { data, error } = await supabase
      .from("challenge_trades")
      .select("id, trading_day_key, close_time_utc, close_epoch_ms, broker_ticket, broker_server, broker_account_number")
      .eq("user_id", userId)
      .eq("broker_account_number", accountNumber)
      .eq("broker_server", brokerServer)
      .eq("broker_ticket", ticket)
      .maybeSingle();
    if (error) throw new Error(`trade fetch failed: ${error.message}`);
    return data || null;
  }

  async function expectCase(name, payload, expectedStatus, expectedField, expectedValue, extraCheck = null) {
    const result = await callImport(payload);
    const actualFieldValue =
      expectedField === "statusCode"
        ? result.status
        : result?.body && typeof result.body === "object"
        ? result.body[expectedField]
        : undefined;

    const ok = actualFieldValue === expectedValue && result.status === expectedStatus;
    if (!ok) {
      const bodyText = JSON.stringify(result.body);
      throw new Error(
        `${name} failed: expected http=${expectedStatus} ${expectedField}=${expectedValue}, got http=${result.status} body=${bodyText}`
      );
    }
    if (typeof extraCheck === "function") await extraCheck(result);
    console.log(`PASS ${name} -> http=${result.status} ${expectedField}=${expectedValue}`);
    return result;
  }

  async function createTestUser() {
    const { data, error } = await supabase.auth.admin.createUser({
      email: userEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { source: "mt5-contract" },
    });
    if (error) throw new Error(`create test user failed: ${error.message}`);
    if (!data?.user?.id) throw new Error("create test user failed: missing user id");
    userId = data.user.id;
  }

  async function cleanupAll() {
    if (!userId) return;
    const operations = [
      supabase.from("challenge_trades").delete().eq("user_id", userId),
      supabase.from("one_trade_rule_ticket_quarantine").delete().eq("user_id", userId),
      supabase.from("one_trade_rule_states").delete().eq("user_id", userId),
      supabase.from("broker_connections").delete().eq("user_id", userId),
      supabase.auth.admin.deleteUser(userId),
    ];
    const results = await Promise.allSettled(operations);
    const failed = results
      .filter((item) => item.status === "rejected")
      .map((item) => item.reason?.message || String(item.reason));
    if (failed.length > 0) {
      console.warn(`Cleanup warning: ${failed.join(" | ")}`);
    }
  }

  try {
    console.log(`MT5 contract verify started -> ${new Date().toISOString()}`);
    console.log(`Import URL: ${importUrl}`);
    await createTestUser();
    await ensureBrokerConnection();
    await clearTestRows();

    await setRuleState({ active: false, challengeCreatedAt: defaultChallengeStart });
    await expectCase(
      "NO_ACTIVE_CHALLENGE",
      createPayload({ ticket: nextTicket() }),
      409,
      "code",
      "NO_ACTIVE_CHALLENGE"
    );

    await setRuleState({ active: true, challengeCreatedAt: defaultChallengeStart });
    await expectCase(
      "MISSING_BROKER_SERVER",
      createPayload({ ticket: nextTicket(), brokerServer: "" }),
      409,
      "code",
      "MISSING_BROKER_SERVER"
    );

    await expectCase(
      "MISSING_EXPLICIT_CLOSE_TIME",
      createPayload({
        ticket: nextTicket(),
        closeEpochMs: null,
        closeTimeUtc: null,
      }),
      409,
      "code",
      "MISSING_EXPLICIT_CLOSE_TIME"
    );

    const invalidTicket = nextTicket();
    await expectCase(
      "INVALID_EXPLICIT_CLOSE_TIME",
      createPayload({
        ticket: invalidTicket,
        closeEpochMs: "not-a-number",
        closeTimeUtc: null,
      }),
      409,
      "code",
      "INVALID_EXPLICIT_CLOSE_TIME"
    );

    await expectCase(
      "TICKET_BLOCKED_PREVIOUSLY_REJECTED_after_invalid",
      createPayload({
        ticket: invalidTicket,
        closeEpochMs: baseCloseMs,
        closeTimeUtc: iso(baseCloseMs),
      }),
      409,
      "code",
      "TICKET_BLOCKED_PREVIOUSLY_REJECTED"
    );

    await setRuleState({ active: true, challengeCreatedAt: blockedChallengeStart });
    const beforeStartTicket = nextTicket();
    await expectCase(
      "TRADE_BEFORE_CHALLENGE_START",
      createPayload({
        ticket: beforeStartTicket,
        closeEpochMs: Date.parse("2026-05-21T20:00:00.000Z"),
        closeTimeUtc: "2026-05-21T20:00:00.000Z",
      }),
      409,
      "code",
      "TRADE_BEFORE_CHALLENGE_START"
    );

    await expectCase(
      "TICKET_BLOCKED_PREVIOUSLY_REJECTED_after_before_start",
      createPayload({
        ticket: beforeStartTicket,
        closeEpochMs: Date.parse("2026-05-22T05:00:00.000Z"),
        closeTimeUtc: "2026-05-22T05:00:00.000Z",
      }),
      409,
      "code",
      "TICKET_BLOCKED_PREVIOUSLY_REJECTED"
    );

    await setRuleState({ active: true, challengeCreatedAt: defaultChallengeStart });
    const beforeCloseTicket = nextTicket();
    await expectCase(
      "INSERT_before_gold_close",
      createPayload({
        ticket: beforeCloseTicket,
        closeEpochMs: Date.parse("2026-05-21T20:59:00.000Z"),
        closeTimeUtc: "2026-05-21T20:59:00.000Z",
      }),
      200,
      "status",
      "inserted",
      async (result) => {
        assert(result.body?.trading_day_key === "2026-05-21", "expected trading_day_key=2026-05-21");
      }
    );

    await expectCase(
      "DUPLICATE_same_ticket",
      createPayload({
        ticket: beforeCloseTicket,
        closeEpochMs: Date.parse("2026-05-21T20:59:00.000Z"),
        closeTimeUtc: "2026-05-21T20:59:00.000Z",
      }),
      200,
      "status",
      "duplicate"
    );

    const afterCloseTicket = nextTicket();
    await expectCase(
      "INSERT_after_gold_close",
      createPayload({
        ticket: afterCloseTicket,
        closeEpochMs: Date.parse("2026-05-21T21:01:00.000Z"),
        closeTimeUtc: "2026-05-21T21:01:00.000Z",
      }),
      200,
      "status",
      "inserted",
      async (result) => {
        assert(result.body?.trading_day_key === "2026-05-22", "expected trading_day_key=2026-05-22");
      }
    );

    const beforeCloseRow = await fetchTrade(beforeCloseTicket);
    const afterCloseRow = await fetchTrade(afterCloseTicket);
    assert(beforeCloseRow?.trading_day_key === "2026-05-21", "db verify failed for before-close ticket");
    assert(afterCloseRow?.trading_day_key === "2026-05-22", "db verify failed for after-close ticket");

    console.log("PASS DB trading_day_key mapping persisted correctly");
    console.log("PASS mt5-import strict contract suite completed");
  } finally {
    if (!keepFixtures) {
      await cleanupAll();
    } else {
      console.log(`Fixtures kept for inspection. user_id=${userId}`);
    }
  }
}

main().catch((error) => {
  console.error(`FAIL mt5-import contract verify: ${error.message}`);
  process.exitCode = 1;
});
