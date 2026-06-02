import test from "node:test";
import assert from "node:assert/strict";
import { defaultOneTradeRuleState } from "../src/lib/stateDefaults.js";
import { DISCIPLINE_DAY_STATUS, evaluateDisciplineState } from "../src/lib/disciplineUtils.js";

function createProject() {
  const base = defaultOneTradeRuleState("user-1");
  return {
    ...base,
    id: "one-trade-rule-user-1",
    disciplineMarketSettings: {
      ...base.disciplineMarketSettings,
      close_time: "17:00",
      close_timezone: "America/New_York",
    },
    disciplineChallenges: [
      {
        id: "challenge-1",
        status: "ACTIVE",
        target_clean_days: 10,
        completed_clean_days: 0,
        current_streak: 0,
        rule_breaks: 0,
        challenge_number: 1,
        start_date: "2026-05-21",
        created_at: "2026-05-21T12:00:00.000Z",
        updated_at: "2026-05-21T12:00:00.000Z",
      },
    ],
  };
}

function createTrade(overrides = {}) {
  return {
    id: "trade-1",
    source: "mt5",
    discipline_challenge_id: "challenge-1",
    trading_day_key: "2026-05-21",
    date: "2026-05-21",
    time: "14:10",
    pair: "XAUUSD",
    direction: "BUY",
    brokerTicket: "10001",
    importedAt: "2026-05-21T18:10:00.000Z",
    outcome: "TP",
    ...overrides,
  };
}

function findDayByKey(result, key) {
  return result.allChallengeDays.find((day) => String(day.trading_day_key || day.trade_date) === key) || null;
}

test("active day transitions from pending to clean after close with one closed trade", () => {
  const project = createProject();
  project.disciplineJournalTrades = [createTrade()];

  const beforeClose = evaluateDisciplineState(project, {
    now: "2026-05-21T18:30:00.000Z",
  });
  assert.equal(findDayByKey(beforeClose, "2026-05-21")?.status, DISCIPLINE_DAY_STATUS.PENDING);

  const afterClose = evaluateDisciplineState(beforeClose.project, {
    now: "2026-05-21T22:30:00.000Z",
  });
  assert.equal(findDayByKey(afterClose, "2026-05-21")?.status, DISCIPLINE_DAY_STATUS.CLEAN);
});

test("day is broken when active challenge has more than one closed trade on same day", () => {
  const project = createProject();
  project.disciplineJournalTrades = [
    createTrade({ id: "trade-1", brokerTicket: "10001", time: "14:10" }),
    createTrade({ id: "trade-2", brokerTicket: "10002", time: "14:15" }),
  ];

  const result = evaluateDisciplineState(project, {
    now: "2026-05-21T18:30:00.000Z",
  });
  assert.equal(findDayByKey(result, "2026-05-21")?.status, DISCIPLINE_DAY_STATUS.BROKEN);
});

test("split MT5 fills in same minute collapse to one decision and avoid false broken day", () => {
  const project = createProject();
  project.disciplineJournalTrades = [
    createTrade({ id: "trade-1", brokerTicket: "10001", time: "14:10:01" }),
    createTrade({ id: "trade-2", brokerTicket: "10002", time: "14:10:45" }),
  ];

  const result = evaluateDisciplineState(project, {
    now: "2026-05-21T22:30:00.000Z",
  });
  assert.equal(findDayByKey(result, "2026-05-21")?.status, DISCIPLINE_DAY_STATUS.CLEAN);
});

test("active challenge day evaluation ignores trades attached to other challenges", () => {
  const project = createProject();
  project.disciplineChallenges = [
    ...project.disciplineChallenges,
    {
      id: "challenge-2",
      status: "ARCHIVED",
      target_clean_days: 10,
      challenge_number: 2,
      start_date: "2026-05-21",
      created_at: "2026-05-20T12:00:00.000Z",
      updated_at: "2026-05-20T12:00:00.000Z",
    },
  ];
  project.disciplineJournalTrades = [
    createTrade({ id: "trade-active", discipline_challenge_id: "challenge-1", brokerTicket: "10001" }),
    createTrade({ id: "trade-other", discipline_challenge_id: "challenge-2", brokerTicket: "10002" }),
  ];

  const result = evaluateDisciplineState(project, {
    now: "2026-05-21T18:30:00.000Z",
  });
  assert.equal(findDayByKey(result, "2026-05-21")?.status, DISCIPLINE_DAY_STATUS.PENDING);
  assert.equal(result.todayTradesCount, 1);
});
