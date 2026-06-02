import test from "node:test";
import assert from "node:assert/strict";
import { defaultOneTradeRuleState } from "../src/lib/stateDefaults.js";
import { normalizeChallengeTradeSet } from "../src/lib/oneTradeRuleEngine.js";

function createRule() {
  const base = defaultOneTradeRuleState("user-1");
  return {
    ...base,
    id: "one-trade-rule-user-1",
    disciplineMarketSettings: {
      ...base.disciplineMarketSettings,
      close_time: "17:00",
      close_timezone: "America/New_York",
    },
  };
}

function createTrade(overrides = {}) {
  return {
    id: "trade-1",
    source: "mt5",
    discipline_challenge_id: "challenge-1",
    challenge_id: "challenge-1",
    trading_day_key: "2026-05-21",
    date: "2026-05-21",
    time: "14:10",
    pair: "XAUUSD",
    direction: "BUY",
    entryPrice: 3340.1,
    closePrice: 3342.5,
    lotSize: 0.1,
    outcome: "TP",
    broker_ticket: "10001",
    broker_account_number: "ACC-01",
    broker_server: "HFMarketsGlobal-Demo",
    imported_at: "2026-05-21T18:10:00.000Z",
    ...overrides,
  };
}

test("normalizeChallengeTradeSet keeps same ticket from different broker servers", () => {
  const rule = createRule();
  const tradeA = createTrade({
    id: "trade-a",
    broker_ticket: "20001",
    broker_server: "Broker-A",
  });
  const tradeB = createTrade({
    id: "trade-b",
    broker_ticket: "20001",
    broker_server: "Broker-B",
  });

  const result = normalizeChallengeTradeSet(rule, [tradeA, tradeB], new Date("2026-05-21T18:30:00.000Z"));
  assert.equal(result.trades.length, 2);
  assert.equal(result.changed, false);
});

test("normalizeChallengeTradeSet dedupes same account+server+ticket within one challenge", () => {
  const rule = createRule();
  const tradeA = createTrade({
    id: "trade-a",
    broker_ticket: "30001",
    broker_server: "Broker-A",
    broker_account_number: "ACC-77",
  });
  const tradeB = createTrade({
    id: "trade-b",
    broker_ticket: "30001",
    broker_server: "Broker-A",
    broker_account_number: "ACC-77",
  });

  const result = normalizeChallengeTradeSet(rule, [tradeA, tradeB], new Date("2026-05-21T18:30:00.000Z"));
  assert.equal(result.trades.length, 1);
  assert.equal(result.changed, true);
});

test("normalizeChallengeTradeSet backfills trading_day_key from importedAt using gold close mapping", () => {
  const rule = createRule();
  const trade = createTrade({
    id: "trade-day-map",
    trading_day_key: "",
    imported_at: "2026-05-21T21:30:00.000Z",
    date: "",
    time: "",
  });

  const result = normalizeChallengeTradeSet(rule, [trade], new Date("2026-05-21T22:00:00.000Z"));
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].trading_day_key, "2026-05-22");
  assert.equal(result.changed, true);
});
