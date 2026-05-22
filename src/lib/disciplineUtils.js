import { localDateValue } from "./journalUtils.js";
import { READINESS_STATUS } from "./readinessUtils.js";

const ONE_TRADE_READINESS_STATE = {
  NOT_CHECKED: "NOT_CHECKED",
  READY: "READY",
  CAUTION: "CAUTION",
  DO_NOT_TRADE: "DO_NOT_TRADE",
};

const ONE_TRADE_READINESS_STATE_SET = new Set(Object.values(ONE_TRADE_READINESS_STATE));

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toIsoNow() {
  return new Date().toISOString();
}

function asDateValue(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseTimeValue(value, fallback = "17:00") {
  const raw = String(value || fallback).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return parseTimeValue(fallback, "17:00");
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  const second = Math.max(0, Math.min(59, Number(match[3] || 0)));
  return { hour, minute, second };
}

function secondsOfDay(hour, minute, second = 0) {
  return hour * 3600 + minute * 60 + second;
}

function parseDateKey(dateKey) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatDateKey(parts) {
  const y = String(parts.year).padStart(4, "0");
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDateKey(dateKey, offsetDays) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const base = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + offsetDays, 12, 0, 0));
  return formatDateKey({
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  });
}

function getDayGap(prevDate, nextDate) {
  const prev = parseDateKey(prevDate);
  const next = parseDateKey(nextDate);
  if (!prev || !next) return 0;
  const a = Date.UTC(prev.year, prev.month - 1, prev.day);
  const b = Date.UTC(next.year, next.month - 1, next.day);
  return Math.round((b - a) / 86400000);
}

function isWeekendKey(dateKey, timeZone) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return false;
  const noonUtc = zonedDateTimeToUtc(
    dateKey,
    "12:00",
    timeZone
  );
  const weekday = getTimeZoneParts(noonUtc, timeZone).weekday;
  return weekday === "Sat" || weekday === "Sun";
}

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const raw = formatter.formatToParts(date);
  const parts = {};
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
    weekday: parts.weekday,
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const p = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(dateKey, timeValue, timeZone) {
  const dateParts = parseDateKey(dateKey);
  const timeParts = parseTimeValue(timeValue);
  if (!dateParts) return new Date();

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

export const DISCIPLINE_CHALLENGE_TYPE = "ONE_TRADE_DISCIPLINE";

export const DISCIPLINE_DAY_STATUS = {
  WAITING: "WAITING",
  PENDING: "PENDING",
  COMMITTED: "COMMITTED",
  NO_TRADE: "NO_TRADE",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  // Legacy aliases kept for backward compatibility in stored payloads.
  TRADE_TAKEN: "TRADE_TAKEN",
  PENDING_CLEAN: "PENDING_CLEAN",
  CLEAN: "CLEAN",
  BROKEN: "BROKEN",
  MARKET_CLOSED: "MARKET_CLOSED",
  FINALIZED: "FINALIZED",
  // Legacy aliases kept for compatibility with old saved data.
  CLEAN_DAY_PENDING: "PENDING",
  CLEAN_DAY_COMPLETED: "CLEAN",
  BROKEN_DAY: "BROKEN",
  TODAY_CLOSED: "PENDING",
};

const LEGACY_STATUS_MAP = {
  PENDING: DISCIPLINE_DAY_STATUS.PENDING,
  PENDING_CLEAN: DISCIPLINE_DAY_STATUS.PENDING,
  CLEAN_DAY_PENDING: DISCIPLINE_DAY_STATUS.PENDING,
  CLEAN_DAY_COMPLETED: DISCIPLINE_DAY_STATUS.CLEAN,
  BROKEN_DAY: DISCIPLINE_DAY_STATUS.BROKEN,
  TODAY_CLOSED: DISCIPLINE_DAY_STATUS.PENDING,
  TRADE_TAKEN: DISCIPLINE_DAY_STATUS.PENDING,
};

export const DISCIPLINE_CHALLENGE_STATUS = {
  ACTIVE: "ACTIVE",
  BROKEN_FROZEN: "BROKEN_FROZEN",
  SCHEDULED: "SCHEDULED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  ARCHIVED: "ARCHIVED",
};

export const DEFAULT_DISCIPLINE_MARKET_SETTINGS = {
  market_symbol: "XAUUSD",
  close_mode: "GOLD_MARKET_CLOSE",
  close_time: "17:00",
  close_timezone: "America/New_York",
  weekend_closed: true,
  auto_finalize_enabled: true,
};

export const DISCIPLINE_MISSION_TEXT =
  "Take only 1 trade. If SL hits, accept it. No second trade today.";

export const DISCIPLINE_IDENTITY_TEXT =
  "I am a trader who stops after one trade.";

export const DISCIPLINE_RULE_CARD_TEXT = `One trade only.
SL hit = success if I stop.
Profit = success if I stop.
No second trade.

Today's goal:
Do not make money.
Build discipline.`;

export const DISCIPLINE_DEFAULT_COMMITMENT_TEXT = `I accept:
- I will take only one trade today.
- If SL hits, I will stop.
- If profit comes, I will stop.
- I do not need to recover anything today.

Today's win is discipline.`;

function getDisciplineBindingProjectId(container) {
  if (!container || typeof container !== "object") return "";
  if (container.disciplineScope === "USER") return "";
  return container.id || "";
}

function normalizeChallengeStatus(status) {
  const raw = String(status || "").trim().toUpperCase();
  // Legacy frozen status should not deactivate the run anymore.
  if (raw === DISCIPLINE_CHALLENGE_STATUS.BROKEN_FROZEN) {
    return DISCIPLINE_CHALLENGE_STATUS.ACTIVE;
  }
  return Object.values(DISCIPLINE_CHALLENGE_STATUS).includes(raw)
    ? raw
    : DISCIPLINE_CHALLENGE_STATUS.ACTIVE;
}

function normalizeDayStatus(status) {
  const raw = String(status || "").trim();
  const mapped = LEGACY_STATUS_MAP[raw] || raw;
  return [
    DISCIPLINE_DAY_STATUS.WAITING,
    DISCIPLINE_DAY_STATUS.PENDING,
    DISCIPLINE_DAY_STATUS.COMMITTED,
    DISCIPLINE_DAY_STATUS.NO_TRADE,
    DISCIPLINE_DAY_STATUS.NEEDS_REVIEW,
    DISCIPLINE_DAY_STATUS.TRADE_TAKEN,
    DISCIPLINE_DAY_STATUS.PENDING_CLEAN,
    DISCIPLINE_DAY_STATUS.CLEAN,
    DISCIPLINE_DAY_STATUS.BROKEN,
    DISCIPLINE_DAY_STATUS.MARKET_CLOSED,
    DISCIPLINE_DAY_STATUS.FINALIZED,
  ].includes(mapped)
    ? mapped
    : DISCIPLINE_DAY_STATUS.WAITING;
}

export function normalizeDisciplineMarketSettings(settings = {}, projectId = "") {
  const now = toIsoNow();
  const close = parseTimeValue(settings.close_time || settings.closeTime || DEFAULT_DISCIPLINE_MARKET_SETTINGS.close_time);
  return {
    id: settings.id ? String(settings.id) : createId("discipline-market"),
    project_id: settings.project_id || settings.projectId || projectId || "",
    market_symbol:
      settings.market_symbol ||
      settings.marketSymbol ||
      DEFAULT_DISCIPLINE_MARKET_SETTINGS.market_symbol,
    close_mode:
      settings.close_mode ||
      settings.closeMode ||
      DEFAULT_DISCIPLINE_MARKET_SETTINGS.close_mode,
    close_time: `${String(close.hour).padStart(2, "0")}:${String(close.minute).padStart(2, "0")}`,
    close_timezone:
      settings.close_timezone ||
      settings.closeTimezone ||
      DEFAULT_DISCIPLINE_MARKET_SETTINGS.close_timezone,
    weekend_closed:
      settings.weekend_closed === undefined
        ? settings.weekendClosed === undefined
          ? DEFAULT_DISCIPLINE_MARKET_SETTINGS.weekend_closed
          : Boolean(settings.weekendClosed)
        : Boolean(settings.weekend_closed),
    auto_finalize_enabled:
      settings.auto_finalize_enabled === undefined
        ? settings.autoFinalizeEnabled === undefined
          ? DEFAULT_DISCIPLINE_MARKET_SETTINGS.auto_finalize_enabled
          : Boolean(settings.autoFinalizeEnabled)
        : Boolean(settings.auto_finalize_enabled),
    created_at: settings.created_at || settings.createdAt || now,
    updated_at: settings.updated_at || settings.updatedAt || now,
  };
}

export function normalizeDisciplineChallenge(challenge = {}, projectId = "") {
  const now = toIsoNow();
  const targetCleanDays = Math.max(1, asNumber(challenge.target_clean_days || challenge.targetCleanDays, 10));
  const challengeNumber = Math.max(1, asNumber(challenge.challenge_number || challenge.challengeNumber, 1));
  const challengeNameRaw = String(
    challenge.challenge_name ||
      challenge.challengeName ||
      `${targetCleanDays} Clean Days Challenge`
  ).trim();
  return {
    id: challenge.id ? String(challenge.id) : createId("discipline-challenge"),
    project_id: challenge.project_id || projectId || "",
    challenge_type: DISCIPLINE_CHALLENGE_TYPE,
    target_clean_days: targetCleanDays,
    completed_clean_days: Math.max(0, asNumber(challenge.completed_clean_days || challenge.completedCleanDays, 0)),
    current_streak: Math.max(0, asNumber(challenge.current_streak || challenge.currentStreak, 0)),
    rule_breaks: Math.max(0, asNumber(challenge.rule_breaks || challenge.ruleBreaks, 0)),
    status: normalizeChallengeStatus(challenge.status),
    challenge_number: challengeNumber,
    challenge_name: challengeNameRaw || `${targetCleanDays} Clean Days Challenge`,
    restart_on_break:
      challenge.restart_on_break === undefined
        ? true
        : Boolean(challenge.restart_on_break),
    start_date: asDateValue(challenge.start_date || challenge.startDate) || localDateValue(),
    completed_at: challenge.completed_at || challenge.completedAt || "",
    archived_at: challenge.archived_at || challenge.archivedAt || "",
    archive_reason: challenge.archive_reason || challenge.archiveReason || "",
    prepared_from_challenge_id:
      challenge.prepared_from_challenge_id || challenge.preparedFromChallengeId || "",
    scheduled_for_trading_day:
      asDateValue(challenge.scheduled_for_trading_day || challenge.scheduledForTradingDay) || "",
    created_at: challenge.created_at || challenge.createdAt || now,
    updated_at: challenge.updated_at || challenge.updatedAt || now,
  };
}

export function normalizeDisciplineDay(day = {}, projectId = "", challengeId = "") {
  const now = toIsoNow();
  const tradingDayKey =
    asDateValue(day.trading_day_key || day.tradingDayKey) ||
    asDateValue(day.trade_date || day.tradeDate) ||
    localDateValue();
  return {
    id: day.id ? String(day.id) : createId("discipline-day"),
    project_id: day.project_id || projectId || "",
    challenge_id: day.challenge_id || challengeId || "",
    trade_date: tradingDayKey,
    trading_day_key: tradingDayKey,
    status: normalizeDayStatus(day.status),
    trades_count: Math.max(0, asNumber(day.trades_count || day.tradesCount, 0)),
    is_clean_day: Boolean(day.is_clean_day ?? day.isCleanDay),
    score: Math.max(0, Math.min(100, asNumber(day.score, 0))),
    mindset_check_completed: Boolean(day.mindset_check_completed ?? day.mindsetCheckCompleted),
    commitment_completed: Boolean(day.commitment_completed ?? day.commitmentCompleted),
    journal_completed: Boolean(day.journal_completed ?? day.journalCompleted),
    readiness_state_at_trade: String(
      day.readiness_state_at_trade || day.readinessStateAtTrade || ONE_TRADE_READINESS_STATE.NOT_CHECKED
    ),
    readiness_breach: Boolean(day.readiness_breach ?? day.readinessBreach),
    no_trade_reason: String(day.no_trade_reason || day.noTradeReason || ""),
    broken_rule_reason: String(day.broken_rule_reason || day.brokenRuleReason || ""),
    finalized_at: day.finalized_at || day.finalizedAt || "",
    market_close_at: day.market_close_at || day.marketCloseAt || "",
    created_at: day.created_at || day.createdAt || now,
    updated_at: day.updated_at || day.updatedAt || now,
  };
}

export function normalizeDailyCommitment(commitment = {}, projectId = "", challengeId = "") {
  const now = toIsoNow();
  return {
    id: commitment.id ? String(commitment.id) : createId("discipline-commitment"),
    project_id: commitment.project_id || projectId || "",
    challenge_id: commitment.challenge_id || challengeId || "",
    commitment_date:
      asDateValue(commitment.commitment_date || commitment.commitmentDate) || localDateValue(),
    rule_text: String(commitment.rule_text || commitment.ruleText || DISCIPLINE_DEFAULT_COMMITMENT_TEXT),
    committed_at: commitment.committed_at || commitment.committedAt || now,
    created_at: commitment.created_at || commitment.createdAt || now,
  };
}

function sortByDateAsc(a, b) {
  return asDateValue(a).localeCompare(asDateValue(b));
}

function sortTradesAsc(a, b) {
  return `${a.date || ""}${a.time || ""}`.localeCompare(`${b.date || ""}${b.time || ""}`);
}

function sameDaySnapshot(a, b) {
  if (!a || !b) return false;
  return (
    a.status === b.status &&
    asNumber(a.trades_count) === asNumber(b.trades_count) &&
    Boolean(a.is_clean_day) === Boolean(b.is_clean_day) &&
    asNumber(a.score) === asNumber(b.score) &&
    Boolean(a.mindset_check_completed) === Boolean(b.mindset_check_completed) &&
    Boolean(a.commitment_completed) === Boolean(b.commitment_completed) &&
    Boolean(a.journal_completed) === Boolean(b.journal_completed) &&
    String(a.readiness_state_at_trade || ONE_TRADE_READINESS_STATE.NOT_CHECKED) ===
      String(b.readiness_state_at_trade || ONE_TRADE_READINESS_STATE.NOT_CHECKED) &&
    Boolean(a.readiness_breach) === Boolean(b.readiness_breach) &&
    String(a.no_trade_reason || "") === String(b.no_trade_reason || "") &&
    String(a.broken_rule_reason || "") === String(b.broken_rule_reason || "") &&
    String(a.finalized_at || "") === String(b.finalized_at || "") &&
    String(a.market_close_at || "") === String(b.market_close_at || "")
  );
}

function normalizeClosedTradeOutcome(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "tp" || lower === "tp hit" || lower === "take profit" || lower === "take-profit") {
    return "TP";
  }
  if (lower === "sl" || lower === "sl hit" || lower === "stop loss" || lower === "stop-loss") {
    return "SL";
  }
  if (lower === "manual" || lower === "manual close" || lower === "manual exit" || lower === "close") {
    return "Manual";
  }
  if (lower === "breakeven" || lower === "break even" || lower === "break-even" || lower === "be") {
    return "Breakeven";
  }
  return raw;
}

function isMt5ImportedDisciplineTrade(trade = {}) {
  const sourceText = String(
    trade?.brokerSource ||
      trade?.broker_source ||
      trade?.source ||
      trade?.importSource ||
      trade?.platform ||
      trade?.note ||
      ""
  ).toUpperCase();
  if (sourceText.includes("MT5")) return true;
  if (trade?.brokerTicket || trade?.broker_ticket) return true;
  return false;
}

function buildMt5DecisionKey(trade = {}) {
  if (!isMt5ImportedDisciplineTrade(trade)) return "";
  const dateKey = asDateValue(trade?.trading_day_key || trade?.tradingDayKey || trade?.date);
  const rawTime = String(trade?.time || "").trim();
  const minuteKey = rawTime ? rawTime.slice(0, 5) : "00:00";
  const pairKey = String(trade?.pair || "").trim().toUpperCase();
  const directionKey = String(trade?.direction || "").trim().toUpperCase();
  return `${dateKey}|${minuteKey}|${pairKey}|${directionKey}`;
}

function collapseMt5SplitTrades(trades = []) {
  const collapsed = [];
  const seen = new Set();
  for (const trade of trades) {
    const decisionKey = buildMt5DecisionKey(trade);
    if (!decisionKey) {
      collapsed.push(trade);
      continue;
    }
    if (seen.has(decisionKey)) continue;
    seen.add(decisionKey);
    collapsed.push(trade);
  }
  return collapsed;
}

function hasClosedExitData(trade = {}) {
  const pnlNumber = Number(trade?.pnl);
  if (Number.isFinite(pnlNumber)) return true;
  const exitPriceNumber = Number(trade?.exitPrice ?? trade?.exit_price);
  if (Number.isFinite(exitPriceNumber) && exitPriceNumber !== 0) return true;
  const exitText = String(trade?.exit || "").trim();
  if (exitText) return true;
  return false;
}

function isClosedDisciplineTrade(trade) {
  const normalizedOutcome = normalizeClosedTradeOutcome(trade?.outcome);
  if (["TP", "SL", "Manual", "Breakeven"].includes(normalizedOutcome)) return true;
  if (isMt5ImportedDisciplineTrade(trade) && hasClosedExitData(trade)) return true;
  return false;
}

function evaluateDayScore({ mindsetCompleted, tradesCount, stoppedAfterClose, journalCompleted }) {
  const score =
    (mindsetCompleted ? 20 : 0) +
    (tradesCount === 1 ? 40 : 0) +
    (stoppedAfterClose ? 30 : 0) +
    (journalCompleted ? 10 : 0);
  return Math.max(0, Math.min(100, score));
}

function mapReadinessStatusToOneTradeState(readinessStatus, readinessScore) {
  const normalizedStatus = String(readinessStatus || "").toUpperCase();
  if (normalizedStatus === READINESS_STATUS.DO_NOT_TRADE) {
    return ONE_TRADE_READINESS_STATE.DO_NOT_TRADE;
  }
  if (normalizedStatus === READINESS_STATUS.CAUTION) {
    return ONE_TRADE_READINESS_STATE.CAUTION;
  }
  if (normalizedStatus === READINESS_STATUS.READY_TO_TRADE) {
    return ONE_TRADE_READINESS_STATE.READY;
  }
  if (normalizedStatus === READINESS_STATUS.NOT_CHECKED) {
    return ONE_TRADE_READINESS_STATE.NOT_CHECKED;
  }

  const numericScore = Number(readinessScore);
  if (!Number.isFinite(numericScore)) return ONE_TRADE_READINESS_STATE.NOT_CHECKED;
  if (numericScore >= 80) return ONE_TRADE_READINESS_STATE.READY;
  if (numericScore >= 65) return ONE_TRADE_READINESS_STATE.CAUTION;
  return ONE_TRADE_READINESS_STATE.DO_NOT_TRADE;
}

function resolveTradeReadinessStateAtTrade(trade = {}) {
  const explicitState = String(
    trade?.readinessStateAtTrade || trade?.readiness_state_at_trade || ""
  )
    .trim()
    .toUpperCase();
  if (ONE_TRADE_READINESS_STATE_SET.has(explicitState)) {
    return explicitState;
  }
  return mapReadinessStatusToOneTradeState(
    trade?.readinessStatusAtEntry,
    trade?.readinessScoreAtEntry
  );
}

function hasReadinessBreach(trade = {}) {
  if (trade?.readinessBreach ?? trade?.readiness_breach) return true;
  const readinessState = resolveTradeReadinessStateAtTrade(trade);
  if (readinessState === ONE_TRADE_READINESS_STATE.DO_NOT_TRADE) return true;
  return String(trade?.readinessStatusAtEntry || "").toUpperCase() === READINESS_STATUS.DO_NOT_TRADE;
}

function getTradeTimestamp(trade, settings) {
  const dateKey = asDateValue(trade?.date);
  if (!dateKey) return null;
  const rawTime = String(trade?.time || "12:00").trim();
  const timeMatch = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const safeTime = timeMatch
    ? `${String(Math.max(0, Math.min(23, Number(timeMatch[1])))).padStart(2, "0")}:${String(
        Math.max(0, Math.min(59, Number(timeMatch[2])))
      ).padStart(2, "0")}:${String(Math.max(0, Math.min(59, Number(timeMatch[3] || 0)))).padStart(2, "0")}`
    : "12:00:00";
  return zonedDateTimeToUtc(dateKey, safeTime, settings.close_timezone);
}

function getChallengeStartTimestampMs(challenge) {
  const raw = String(challenge?.created_at || challenge?.updated_at || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

export function getTradeEventTimestampMsForChallenge(trade, settings) {
  const importedRaw = String(trade?.importedAt || trade?.imported_at || "").trim();
  if (importedRaw) {
    const importedStamp = new Date(importedRaw);
    if (!Number.isNaN(importedStamp.getTime())) return importedStamp.getTime();
  }
  // Do not gate challenge attachment by broker clock when importedAt is missing.
  // Broker date/time is display metadata and may be in a different timezone/day.
  return null;
}

export function getGoldTradingDay(value = new Date(), settingsInput = {}) {
  const settings = normalizeDisciplineMarketSettings(settingsInput);
  const now = value instanceof Date ? value : new Date(value);
  const nowParts = getTimeZoneParts(now, settings.close_timezone);
  const close = parseTimeValue(settings.close_time);
  const nowSeconds = secondsOfDay(nowParts.hour, nowParts.minute, nowParts.second);
  const closeSeconds = secondsOfDay(close.hour, close.minute, close.second);
  const localKey = formatDateKey({
    year: nowParts.year,
    month: nowParts.month,
    day: nowParts.day,
  });
  const tradingDayKey = nowSeconds >= closeSeconds ? shiftDateKey(localKey, 1) : localKey;
  const marketCloseAt = zonedDateTimeToUtc(tradingDayKey, settings.close_time, settings.close_timezone);
  return {
    tradingDayKey,
    marketCloseAt,
    isMarketClosed: now.getTime() >= marketCloseAt.getTime(),
  };
}

export function getNextGoldMarketClose(value = new Date(), settingsInput = {}) {
  const settings = normalizeDisciplineMarketSettings(settingsInput);
  const now = value instanceof Date ? value : new Date(value);
  const currentDay = getGoldTradingDay(now, settings);
  if (now.getTime() < currentDay.marketCloseAt.getTime()) return currentDay.marketCloseAt;
  const nextKey = shiftDateKey(currentDay.tradingDayKey, 1);
  return zonedDateTimeToUtc(nextKey, settings.close_time, settings.close_timezone);
}

export function isGoldMarketClosedForDay(value = new Date(), tradingDayKey = "", settingsInput = {}) {
  if (!tradingDayKey) return false;
  const settings = normalizeDisciplineMarketSettings(settingsInput);
  const now = value instanceof Date ? value : new Date(value);
  const closeAt = zonedDateTimeToUtc(tradingDayKey, settings.close_time, settings.close_timezone);
  return now.getTime() >= closeAt.getTime();
}

export function getCountdownToGoldClose(value = new Date(), settingsInput = {}) {
  const settings = normalizeDisciplineMarketSettings(settingsInput);
  const now = value instanceof Date ? value : new Date(value);
  const active = getGoldTradingDay(now, settings);
  const ms = Math.max(0, active.marketCloseAt.getTime() - now.getTime());
  return {
    ms,
    target: active.marketCloseAt,
    tradingDayKey: active.tradingDayKey,
    isWeekend: settings.weekend_closed && isWeekendKey(active.tradingDayKey, settings.close_timezone),
  };
}

export function getTradeTradingDayKey(trade, settings) {
  const stamp = getTradeTimestamp(trade, settings);
  if (!stamp) return "";
  return getGoldTradingDay(stamp, settings).tradingDayKey;
}

function getTradeTradingDayKeyForEvaluation(trade, settings) {
  const explicit = asDateValue(trade?.trading_day_key || trade?.tradingDayKey);
  if (explicit) return explicit;
  return getTradeTradingDayKey(trade, settings);
}

export function startDisciplineChallenge(project, config = {}) {
  const bindingProjectId = getDisciplineBindingProjectId(project);
  const marketSettings = normalizeDisciplineMarketSettings(project?.disciplineMarketSettings, bindingProjectId);
  const today = getGoldTradingDay(new Date(), marketSettings).tradingDayKey || localDateValue();
  const now = toIsoNow();
  const requestedTarget = Number(
    typeof config === "number" ? config : config?.targetCleanDays || config?.target_clean_days
  );
  const normalizedTarget = [5, 10, 15].includes(requestedTarget)
    ? requestedTarget
    : 10;
  const currentCounter = Math.max(0, asNumber(project?.disciplineChallengeCounter, 0));
  const nextChallengeNumber = currentCounter + 1;
  const requestedName =
    typeof config === "object" ? String(config?.challengeName || config?.challenge_name || "").trim() : "";
  const challengeName = requestedName || `${normalizedTarget} Clean Days Challenge`;

  const challenges = Array.isArray(project?.disciplineChallenges)
    ? project.disciplineChallenges.map((item) => normalizeDisciplineChallenge(item, bindingProjectId))
    : [];

  const archived = challenges.map((challenge) =>
    challenge.status === DISCIPLINE_CHALLENGE_STATUS.ACTIVE ||
    challenge.status === DISCIPLINE_CHALLENGE_STATUS.SCHEDULED ||
    challenge.status === DISCIPLINE_CHALLENGE_STATUS.BROKEN_FROZEN
      ? {
          ...challenge,
          status: DISCIPLINE_CHALLENGE_STATUS.ARCHIVED,
          archived_at: challenge.archived_at || now,
          archive_reason: challenge.archive_reason || "Replaced by a new challenge",
          updated_at: now,
        }
      : challenge
  );

  const nextChallenge = normalizeDisciplineChallenge(
    {
      target_clean_days: normalizedTarget,
      completed_clean_days: 0,
      current_streak: 0,
      rule_breaks: 0,
      status: DISCIPLINE_CHALLENGE_STATUS.ACTIVE,
      restart_on_break: true,
      start_date: today,
      challenge_name: challengeName,
      challenge_number: nextChallengeNumber,
      created_at: now,
      updated_at: now,
    },
    bindingProjectId
  );

  return {
    ...project,
    disciplineMarketSettings: marketSettings,
    disciplineChallenges: [nextChallenge, ...archived],
    disciplineDays: Array.isArray(project?.disciplineDays) ? project.disciplineDays : [],
    disciplineTradeEvents: Array.isArray(project?.disciplineTradeEvents)
      ? project.disciplineTradeEvents
      : [],
    dailyCommitments: Array.isArray(project?.dailyCommitments) ? project.dailyCommitments : [],
    disciplineChallengeCounter: nextChallengeNumber,
    disciplineNotices: Array.isArray(project?.disciplineNotices) ? project.disciplineNotices : [],
  };
}

export function getActiveDisciplineChallenge(project) {
  const bindingProjectId = getDisciplineBindingProjectId(project);
  const challenges = Array.isArray(project?.disciplineChallenges)
    ? project.disciplineChallenges.map((item) => normalizeDisciplineChallenge(item, bindingProjectId))
    : [];
  return (
    challenges.find((challenge) => challenge.status === DISCIPLINE_CHALLENGE_STATUS.ACTIVE) || null
  );
}

export function exitDisciplineChallenge(project) {
  if (!project) return project;
  const now = toIsoNow();
  const bindingProjectId = getDisciplineBindingProjectId(project);
  const challenges = Array.isArray(project.disciplineChallenges)
    ? project.disciplineChallenges.map((item) => normalizeDisciplineChallenge(item, bindingProjectId))
    : [];

  const nextChallenges = challenges.map((challenge) =>
    challenge.status === DISCIPLINE_CHALLENGE_STATUS.ACTIVE ||
    challenge.status === DISCIPLINE_CHALLENGE_STATUS.SCHEDULED ||
    challenge.status === DISCIPLINE_CHALLENGE_STATUS.BROKEN_FROZEN ||
    challenge.status === DISCIPLINE_CHALLENGE_STATUS.COMPLETED
      ? {
          ...challenge,
          status: DISCIPLINE_CHALLENGE_STATUS.ARCHIVED,
          archived_at: challenge.archived_at || now,
          archive_reason: challenge.archive_reason || "Exited by user",
          updated_at: now,
        }
      : challenge
  );

  return {
    ...project,
    disciplineChallenges: nextChallenges,
  };
}

export function addDailyCommitment(project, challenge, options = {}) {
  if (!project || !challenge) return project;
  const date = asDateValue(options.date) || localDateValue();
  const bindingProjectId = getDisciplineBindingProjectId(project);
  const commitments = Array.isArray(project.dailyCommitments)
    ? project.dailyCommitments.map((item) =>
        normalizeDailyCommitment(item, bindingProjectId, challenge.id)
      )
    : [];

  const exists = commitments.find(
    (item) => item.challenge_id === challenge.id && item.commitment_date === date
  );
  if (exists) return project;

  const next = normalizeDailyCommitment(
    {
      challenge_id: challenge.id,
      commitment_date: date,
      rule_text: options.ruleText || DISCIPLINE_DEFAULT_COMMITMENT_TEXT,
    },
    bindingProjectId,
    challenge.id
  );

  return {
    ...project,
    dailyCommitments: [next, ...commitments],
  };
}

function sortChallengesLatestFirst(a, b) {
  const aNum = asNumber(a?.challenge_number, 0);
  const bNum = asNumber(b?.challenge_number, 0);
  if (aNum !== bNum) return bNum - aNum;
  const aUpdated = String(a?.updated_at || a?.created_at || "");
  const bUpdated = String(b?.updated_at || b?.created_at || "");
  return bUpdated.localeCompare(aUpdated);
}

function getBestStreakMap(project) {
  const raw = project?.disciplineBestStreakByTarget;
  if (!raw || typeof raw !== "object") return {};
  return { ...raw };
}

function setBestStreakForTarget(project, target, streak) {
  const key = String(Math.max(1, asNumber(target, 1)));
  const current = getBestStreakMap(project);
  const prev = Math.max(0, asNumber(current[key], 0));
  if (streak <= prev) return project;
  return {
    ...project,
    disciplineBestStreakByTarget: {
      ...current,
      [key]: streak,
    },
  };
}

function buildRecentDays(days = [], length = 7, options = {}) {
  const byKey = new Map();
  days.forEach((day) => {
    const key = asDateValue(day?.trading_day_key || day?.trade_date);
    if (!key) return;
    byKey.set(key, normalizeDayStatus(day?.status));
  });
  const sortedKeys = [...byKey.keys()].sort(sortByDateAsc);
  const safeLength = Math.max(1, length);
  const startKey = asDateValue(options.startDate || options.start_date);
  const keys =
    startKey && sortedKeys.length === 0
      ? Array.from({ length: safeLength }, (_, index) => shiftDateKey(startKey, index))
      : sortedKeys.slice(Math.max(0, sortedKeys.length - safeLength));
  const currentTradingDayKey = asDateValue(
    options.currentTradingDayKey || options.current_trading_day_key
  );
  return keys.map((key) => {
    const rawStatus = byKey.get(key);
    const status =
      currentTradingDayKey && key > currentTradingDayKey
        ? DISCIPLINE_DAY_STATUS.WAITING
        : rawStatus;
    let symbol = "•";
    let label = "Waiting";
    if (status === DISCIPLINE_DAY_STATUS.CLEAN) {
      symbol = "✅";
      label = "Clean Day";
    } else if (status === DISCIPLINE_DAY_STATUS.BROKEN) {
      symbol = "❌";
      label = "Broken Day";
    } else if (
      status === DISCIPLINE_DAY_STATUS.PENDING ||
      status === DISCIPLINE_DAY_STATUS.PENDING_CLEAN ||
      status === DISCIPLINE_DAY_STATUS.TRADE_TAKEN
    ) {
      symbol = "⏳";
      label = "Pending Clean Day";
    } else if (status === DISCIPLINE_DAY_STATUS.NO_TRADE) {
      symbol = "•";
      label = "No Trade Day";
    }
    return { tradingDayKey: key, status, symbol, label };
  });
}

export function evaluateDisciplineState(project, options = {}) {
  if (!project) return { project: null, activeChallenge: null, todayDay: null, todayTradesCount: 0 };

  const bindingProjectId = getDisciplineBindingProjectId(project);
  const now = options.now
    ? new Date(options.now)
    : options.today
      ? new Date(`${asDateValue(options.today)}T12:00:00`)
      : new Date();
  const nowIso = now.toISOString();
  const marketSettings = normalizeDisciplineMarketSettings(project.disciplineMarketSettings, bindingProjectId);
  const nowTradingDay = getGoldTradingDay(now, marketSettings);
  const closeTradingDayKey = asDateValue(
    options.closeTradingDayKey || options.close_trading_day_key || nowTradingDay.tradingDayKey
  );
  const forceFinalize = Boolean(options.forceFinalize);
  const transitionDepth = Math.max(0, asNumber(options._transitionDepth, 0));

  const challenges = Array.isArray(project.disciplineChallenges)
    ? project.disciplineChallenges.map((item) => normalizeDisciplineChallenge(item, bindingProjectId))
    : [];
  const allDayRecords = Array.isArray(project.disciplineDays)
    ? project.disciplineDays.map((item) => normalizeDisciplineDay(item, bindingProjectId, item?.challenge_id || ""))
    : [];
  const disciplineTrades = Array.isArray(project.disciplineJournalTrades)
    ? [...project.disciplineJournalTrades].sort(sortTradesAsc)
    : [];
  const commitments = Array.isArray(project.dailyCommitments)
    ? project.dailyCommitments.map((item) =>
        normalizeDailyCommitment(item, bindingProjectId, item?.challenge_id || "")
      )
    : [];

  let updatedChallenges = [...challenges];
  let transitionsChanged = false;

  let activeChallenge =
    updatedChallenges.find((item) => item.status === DISCIPLINE_CHALLENGE_STATUS.ACTIVE) || null;

  if (!activeChallenge) {
    const readyScheduled = updatedChallenges
      .filter(
        (item) =>
          item.status === DISCIPLINE_CHALLENGE_STATUS.SCHEDULED &&
          item.scheduled_for_trading_day &&
          item.scheduled_for_trading_day <= nowTradingDay.tradingDayKey
      )
      .sort((a, b) => {
        const dayCompare = String(a.scheduled_for_trading_day || "").localeCompare(
          String(b.scheduled_for_trading_day || "")
        );
        if (dayCompare !== 0) return dayCompare;
        return asNumber(a.challenge_number, 0) - asNumber(b.challenge_number, 0);
      });
    if (readyScheduled.length > 0) {
      const toActivate = readyScheduled[0];
      updatedChallenges = updatedChallenges.map((item) =>
        item.id === toActivate.id
          ? {
              ...item,
              status: DISCIPLINE_CHALLENGE_STATUS.ACTIVE,
              updated_at: nowIso,
            }
          : item
      );
      transitionsChanged = true;
      activeChallenge =
        updatedChallenges.find((item) => item.id === toActivate.id) || null;
    }
  }

  if (!activeChallenge && transitionDepth < 2) {
    const brokenFrozen = [...updatedChallenges]
      .filter((item) => item.status === DISCIPLINE_CHALLENGE_STATUS.BROKEN_FROZEN)
      .sort(sortChallengesLatestFirst)[0];
    if (brokenFrozen) {
      const brokenRows = allDayRecords
        .filter(
          (day) =>
            day.challenge_id === brokenFrozen.id &&
            normalizeDayStatus(day.status) === DISCIPLINE_DAY_STATUS.BROKEN
        )
        .sort((a, b) =>
          asDateValue(a.trading_day_key || a.trade_date).localeCompare(
            asDateValue(b.trading_day_key || b.trade_date)
          )
        );
      const brokenKey = asDateValue(
        brokenRows.at(-1)?.trading_day_key || brokenRows.at(-1)?.trade_date
      );
      const nextStart = brokenKey ? shiftDateKey(brokenKey, 1) : "";
      if (nextStart && nowTradingDay.tradingDayKey >= nextStart) {
        const prepared = prepareNextDisciplineRun(
          {
            ...project,
            disciplineMarketSettings: marketSettings,
            disciplineChallenges: updatedChallenges,
          },
          { challengeId: brokenFrozen.id, now }
        );
        if (prepared?.project) {
          return evaluateDisciplineState(prepared.project, {
            ...options,
            _transitionDepth: transitionDepth + 1,
          });
        }
      }
    }
  }

  if (!activeChallenge) {
    const currentChallenge =
      [...updatedChallenges]
        .filter(
          (item) =>
            item.status === DISCIPLINE_CHALLENGE_STATUS.BROKEN_FROZEN ||
            item.status === DISCIPLINE_CHALLENGE_STATUS.SCHEDULED
        )
        .sort(sortChallengesLatestFirst)[0] ||
      [...updatedChallenges]
        .filter((item) => item.status !== DISCIPLINE_CHALLENGE_STATUS.ARCHIVED)
        .sort(sortChallengesLatestFirst)[0] ||
      null;
    const currentChallengeId = currentChallenge?.id || "";
    const currentDays = currentChallengeId
      ? allDayRecords.filter((day) => day.challenge_id === currentChallengeId)
      : [];
    const todayDay =
      currentDays.find(
        (day) =>
          asDateValue(day.trading_day_key || day.trade_date) === nowTradingDay.tradingDayKey
      ) || null;
    const todayTradesCount = disciplineTrades
      .filter(
        (trade) =>
          trade?.discipline_challenge_id === currentChallengeId &&
          getTradeTradingDayKeyForEvaluation(trade, marketSettings) === nowTradingDay.tradingDayKey &&
          isClosedDisciplineTrade(trade)
      )
      .length;
    const bestMap = getBestStreakMap(project);
    const bestKey = String(Math.max(1, asNumber(currentChallenge?.target_clean_days, 1)));
    const bestStreakCurrentTarget = Math.max(0, asNumber(bestMap[bestKey], 0));

    return {
      project: {
        ...project,
        disciplineMarketSettings: marketSettings,
        disciplineChallenges: updatedChallenges,
        disciplineJournalTrades: disciplineTrades,
        disciplineDays: allDayRecords,
        disciplineTradeEvents: Array.isArray(project.disciplineTradeEvents)
          ? project.disciplineTradeEvents
          : [],
        dailyCommitments: commitments,
      },
      activeChallenge: null,
      currentChallenge,
      todayDay,
      todayTradesCount,
      todayTradingDayKey: nowTradingDay.tradingDayKey,
      allChallengeDays: currentDays,
      recentDays: buildRecentDays(currentDays, 7, {
        startDate: currentChallenge?.start_date || nowTradingDay.tradingDayKey,
        currentTradingDayKey: nowTradingDay.tradingDayKey,
      }),
      bestStreakCurrentTarget,
    };
  }

  const startDate = asDateValue(activeChallenge.start_date) || localDateValue();
  const challengeStartMs = getChallengeStartTimestampMs(activeChallenge);

  const challengeTrades = disciplineTrades
    .filter((trade) => trade?.discipline_challenge_id === activeChallenge.id && isClosedDisciplineTrade(trade))
    .map((trade) => ({
      ...trade,
      outcome: normalizeClosedTradeOutcome(trade?.outcome),
      trading_day_key: getTradeTradingDayKeyForEvaluation(trade, marketSettings),
    }))
    .filter((trade) => {
      if (!trade.trading_day_key || trade.trading_day_key < startDate) return false;
      const hasStableAttachedDayKey = Boolean(
        trade?.discipline_challenge_id && asDateValue(trade?.trading_day_key || trade?.tradingDayKey)
      );
      if (hasStableAttachedDayKey) return true;
      if (!Number.isFinite(challengeStartMs) || challengeStartMs <= 0) return true;
      const tradeEventMs = getTradeEventTimestampMsForChallenge(trade, marketSettings);
      if (!Number.isFinite(tradeEventMs) || tradeEventMs <= 0) return true;
      return tradeEventMs >= challengeStartMs;
    });

  const tradesByDate = challengeTrades.reduce((acc, trade) => {
    const date = trade.trading_day_key;
    acc[date] = acc[date] || [];
    acc[date].push(trade);
    return acc;
  }, {});

  const existingDaysByDate = allDayRecords
    .filter((day) => day.challenge_id === activeChallenge.id)
    .reduce((acc, day) => {
      const key = day.trading_day_key || day.trade_date;
      acc[key] = day;
      return acc;
    }, {});

  const commitmentsByDate = commitments
    .filter((item) => item.challenge_id === activeChallenge.id)
    .reduce((acc, item) => {
      acc[item.commitment_date] = item;
      return acc;
    }, {});

  const dateSet = new Set([
    ...Object.keys(tradesByDate),
    ...Object.keys(existingDaysByDate),
    ...Object.keys(commitmentsByDate),
    nowTradingDay.tradingDayKey,
  ]);
  const previousGoldDayKey = shiftDateKey(nowTradingDay.tradingDayKey, -1);
  if (previousGoldDayKey && previousGoldDayKey >= startDate) {
    dateSet.add(previousGoldDayKey);
  }
  const dates = [...dateSet].sort(sortByDateAsc);

  const evaluatedDays = [];
  for (const date of dates) {
    const previous = existingDaysByDate[date];
    const rawTradeList = (tradesByDate[date] || []).sort(sortTradesAsc);
    const tradeList = collapseMt5SplitTrades(rawTradeList);
    const tradesCount = tradeList.length;
    const readinessStateAtTrade =
      tradesCount > 0
        ? resolveTradeReadinessStateAtTrade(tradeList[0])
        : ONE_TRADE_READINESS_STATE.NOT_CHECKED;
    const readinessBreach = tradesCount > 0 && rawTradeList.some((trade) => hasReadinessBreach(trade));
    const commitment = commitmentsByDate[date];
    const marketCloseAt = zonedDateTimeToUtc(date, marketSettings.close_time, marketSettings.close_timezone);
    const shouldFinalizeDay = forceFinalize && date <= closeTradingDayKey;
    const marketClosed = now.getTime() >= marketCloseAt.getTime() || shouldFinalizeDay;
    const wasFinalized = Boolean(previous?.finalized_at);
    const hasFinalizedTerminalStatus =
      previous?.status === DISCIPLINE_DAY_STATUS.CLEAN ||
      previous?.status === DISCIPLINE_DAY_STATUS.BROKEN ||
      previous?.status === DISCIPLINE_DAY_STATUS.NO_TRADE ||
      previous?.status === DISCIPLINE_DAY_STATUS.NEEDS_REVIEW;
    const finalizedStillValid =
      !forceFinalize &&
      wasFinalized &&
      hasFinalizedTerminalStatus;

    let status;
    if (finalizedStillValid) {
      status = previous.status;
    } else if (tradesCount === 0) {
      status = shouldFinalizeDay || marketClosed
        ? DISCIPLINE_DAY_STATUS.NO_TRADE
        : DISCIPLINE_DAY_STATUS.WAITING;
    } else if (tradesCount === 1) {
      if (marketClosed) {
        status = DISCIPLINE_DAY_STATUS.CLEAN;
      } else {
        status = DISCIPLINE_DAY_STATUS.PENDING;
      }
    } else {
      status = DISCIPLINE_DAY_STATUS.BROKEN;
    }

    const mindsetCompleted =
      tradesCount > 0 &&
      (tradeList[0]?.readinessStatusAtEntry || READINESS_STATUS.NOT_CHECKED) !==
        READINESS_STATUS.NOT_CHECKED;
    const journalCompleted = Boolean(previous?.journal_completed) || tradesCount > 0;
    const stoppedAfterClose = tradesCount === 1;

    let score = evaluateDayScore({
      mindsetCompleted,
      tradesCount,
      stoppedAfterClose,
      journalCompleted,
    });
    if (status === DISCIPLINE_DAY_STATUS.CLEAN && commitment && journalCompleted) {
      score = 100;
    }

    const finalizedAt =
      status === DISCIPLINE_DAY_STATUS.CLEAN ||
      status === DISCIPLINE_DAY_STATUS.BROKEN ||
      status === DISCIPLINE_DAY_STATUS.NO_TRADE ||
      status === DISCIPLINE_DAY_STATUS.NEEDS_REVIEW
        ? previous?.finalized_at || nowIso
        : "";

    const draftDay = normalizeDisciplineDay(
      {
        ...(previous || {}),
        challenge_id: activeChallenge.id,
        trade_date: date,
        trading_day_key: date,
        status,
        trades_count: tradesCount,
        is_clean_day:
          status === DISCIPLINE_DAY_STATUS.CLEAN ||
          status === DISCIPLINE_DAY_STATUS.NO_TRADE,
        score,
        mindset_check_completed: mindsetCompleted,
        commitment_completed: Boolean(commitment),
        journal_completed: journalCompleted,
        readiness_state_at_trade: readinessStateAtTrade,
        readiness_breach: readinessBreach,
        no_trade_reason:
          status === DISCIPLINE_DAY_STATUS.NO_TRADE
            ? String(previous?.no_trade_reason || "")
            : "",
        broken_rule_reason:
          status === DISCIPLINE_DAY_STATUS.BROKEN
            ? String(previous?.broken_rule_reason || "")
            : "",
        finalized_at: finalizedAt,
        market_close_at: marketCloseAt.toISOString(),
        updated_at: previous?.updated_at || nowIso,
      },
      bindingProjectId,
      activeChallenge.id
    );

    const nextDay =
      previous && sameDaySnapshot(previous, draftDay)
        ? previous
        : { ...draftDay, updated_at: nowIso };

    evaluatedDays.push(nextDay);
  }

  const finalizedBrokenDays = evaluatedDays.filter(
    (day) => day.status === DISCIPLINE_DAY_STATUS.BROKEN && day.finalized_at
  ).sort((a, b) =>
    asDateValue(a.trading_day_key || a.trade_date).localeCompare(
      asDateValue(b.trading_day_key || b.trade_date)
    )
  );
  const finalizedSuccessDays = evaluatedDays.filter(
    (day) =>
      (day.status === DISCIPLINE_DAY_STATUS.CLEAN ||
        day.status === DISCIPLINE_DAY_STATUS.NO_TRADE) &&
      day.finalized_at
  ).sort((a, b) =>
    asDateValue(a.trading_day_key || a.trade_date).localeCompare(
      asDateValue(b.trading_day_key || b.trade_date)
    )
  );

  const completedCleanDays = finalizedSuccessDays.length;

  const finalizedTimelineDesc = [...evaluatedDays]
    .filter((day) => Boolean(day.finalized_at))
    .sort((a, b) =>
      asDateValue(b.trading_day_key || b.trade_date).localeCompare(
        asDateValue(a.trading_day_key || a.trade_date)
      )
    );

  let currentStreak = 0;
  let prevKey = "";
  for (const day of finalizedTimelineDesc) {
    const key = asDateValue(day.trading_day_key || day.trade_date);
    const isSuccess =
      day.status === DISCIPLINE_DAY_STATUS.CLEAN ||
      day.status === DISCIPLINE_DAY_STATUS.NO_TRADE;

    if (!prevKey) {
      if (!isSuccess) break;
      currentStreak += 1;
      prevKey = key;
      continue;
    }

    if (!isSuccess) break;
    if (getDayGap(key, prevKey) !== 1) break;
    currentStreak += 1;
    prevKey = key;
  }

  const nextChallengeStatus =
    completedCleanDays >= activeChallenge.target_clean_days
      ? DISCIPLINE_CHALLENGE_STATUS.COMPLETED
      : DISCIPLINE_CHALLENGE_STATUS.ACTIVE;

  const nextChallengeDraft = {
    ...activeChallenge,
    completed_clean_days: completedCleanDays,
    current_streak: currentStreak,
    rule_breaks: finalizedBrokenDays.length,
    status: nextChallengeStatus,
    completed_at:
      nextChallengeStatus === DISCIPLINE_CHALLENGE_STATUS.COMPLETED
        ? activeChallenge.completed_at || nowIso
        : "",
    archived_at:
      nextChallengeStatus === DISCIPLINE_CHALLENGE_STATUS.COMPLETED
        ? activeChallenge.archived_at || nowIso
        : "",
    archive_reason:
      nextChallengeStatus === DISCIPLINE_CHALLENGE_STATUS.COMPLETED
        ? activeChallenge.archive_reason || "Completed"
        : "",
    updated_at: activeChallenge.updated_at || nowIso,
  };
  const challengeChanged =
    asNumber(nextChallengeDraft.completed_clean_days) !==
      asNumber(activeChallenge.completed_clean_days) ||
    asNumber(nextChallengeDraft.current_streak) !== asNumber(activeChallenge.current_streak) ||
    asNumber(nextChallengeDraft.rule_breaks) !== asNumber(activeChallenge.rule_breaks) ||
    nextChallengeDraft.status !== activeChallenge.status ||
    String(nextChallengeDraft.completed_at || "") !== String(activeChallenge.completed_at || "");
  const nextActiveChallenge = challengeChanged
    ? { ...nextChallengeDraft, updated_at: nowIso }
    : activeChallenge;

  updatedChallenges = updatedChallenges.map((challenge) =>
    challenge.id === activeChallenge.id ? nextActiveChallenge : challenge
  );
  if (challengeChanged) transitionsChanged = true;

  const nonActiveDays = allDayRecords.filter((day) => day.challenge_id !== activeChallenge.id);
  const mergedDays = [...nonActiveDays, ...evaluatedDays].sort((a, b) =>
    `${a.trading_day_key || a.trade_date}${a.id}`.localeCompare(
      `${b.trading_day_key || b.trade_date}${b.id}`
    )
  );

  const events = [];
  for (const [date, tradeList] of Object.entries(tradesByDate)) {
    const sorted = [...tradeList].sort(sortTradesAsc);
    sorted.forEach((trade, index) => {
      events.push({
        id: `discipline-event-${nextActiveChallenge.id}-${trade.id}`,
        project_id: bindingProjectId,
        challenge_id: nextActiveChallenge.id,
        discipline_day_id:
          mergedDays.find((day) => day.challenge_id === nextActiveChallenge.id && (day.trading_day_key || day.trade_date) === date)?.id ||
          "",
        trade_id: trade.id,
        event_type: index === 0 ? "FIRST_TRADE_CLOSED" : "RULE_BREAK_SECOND_TRADE",
        result: trade.outcome || "UNKNOWN",
        message:
          index === 0
            ? "First closed trade of the day logged."
            : "Second trade detected. Discipline rule broken.",
        created_at: trade.importedAt || trade.createdAt || nowIso,
      });
    });
  }

  const withBest = setBestStreakForTarget(
    {
      ...project,
      disciplineMarketSettings: marketSettings,
      disciplineChallenges: updatedChallenges,
      disciplineJournalTrades: disciplineTrades,
      disciplineDays: mergedDays,
      disciplineTradeEvents: events,
      dailyCommitments: commitments,
    },
    nextActiveChallenge.target_clean_days,
    Math.max(currentStreak, completedCleanDays)
  );
  const bestMap = getBestStreakMap(withBest);
  const bestKey = String(Math.max(1, asNumber(nextActiveChallenge.target_clean_days, 1)));
  const bestStreakCurrentTarget = Math.max(0, asNumber(bestMap[bestKey], 0));

  const todayDay =
    mergedDays.find(
      (day) =>
        day.challenge_id === nextActiveChallenge.id &&
        (day.trading_day_key || day.trade_date) === nowTradingDay.tradingDayKey
    ) || null;
  const todayTrades = (tradesByDate[nowTradingDay.tradingDayKey] || []).sort(sortTradesAsc);
  const todayTradesCount = todayTrades.length;
  const todayFirstTradeOutcome = todayTrades[0]?.outcome || "";

  return {
    project: withBest,
    activeChallenge: nextActiveChallenge.status === DISCIPLINE_CHALLENGE_STATUS.ACTIVE ? nextActiveChallenge : null,
    currentChallenge: nextActiveChallenge,
    todayDay,
    todayTradesCount,
    todayFirstTradeOutcome,
    todayTradingDayKey: nowTradingDay.tradingDayKey,
    marketCloseAt: nowTradingDay.marketCloseAt.toISOString(),
    allChallengeDays: mergedDays.filter((day) => day.challenge_id === nextActiveChallenge.id),
    recentDays: buildRecentDays(
      mergedDays.filter((day) => day.challenge_id === nextActiveChallenge.id),
      7,
      {
        startDate: nextActiveChallenge.start_date || nowTradingDay.tradingDayKey,
        currentTradingDayKey: nowTradingDay.tradingDayKey,
      }
    ),
    bestStreakCurrentTarget,
    transitionsChanged,
  };
}

export function finalizeEligibleDisciplineDays(project, options = {}) {
  return evaluateDisciplineState(project, { ...options, forceFinalize: true }).project;
}

function inferTradeSource(trade = {}) {
  const sourceText = String(
    trade?.brokerSource ||
      trade?.broker_source ||
      trade?.source ||
      trade?.importSource ||
      trade?.platform ||
      ""
  ).toUpperCase();
  if (sourceText.includes("MT5")) return "mt5";
  if (trade?.brokerTicket || trade?.broker_ticket) return "mt5";
  return "manual";
}

export function closeOneTradeRuleDay(project, options = {}) {
  if (!project) {
    return { project, error: "Missing project state." };
  }

  const now = options.now ? new Date(options.now) : new Date();
  const bindingProjectId = getDisciplineBindingProjectId(project);
  const marketSettings = normalizeDisciplineMarketSettings(
    project?.disciplineMarketSettings,
    bindingProjectId
  );
  const defaultDayKey = getGoldTradingDay(now, marketSettings).tradingDayKey;
  const requestedCloseTradingDayKey = asDateValue(
    options.closeTradingDayKey || options.close_trading_day_key || defaultDayKey
  );
  const closeTradingDayKey = requestedCloseTradingDayKey || defaultDayKey;
  const projectChallenges = Array.isArray(project?.disciplineChallenges)
    ? project.disciplineChallenges.map((item) => normalizeDisciplineChallenge(item, bindingProjectId))
    : [];
  const activeChallengeBefore =
    projectChallenges.find((item) => item.status === DISCIPLINE_CHALLENGE_STATUS.ACTIVE) || null;
  const activeChallengeIdBefore = String(activeChallengeBefore?.id || "");
  const allDaysBefore = Array.isArray(project?.disciplineDays)
    ? project.disciplineDays.map((item) =>
        normalizeDisciplineDay(item, bindingProjectId, item?.challenge_id || "")
      )
    : [];
  const previousSavedDay =
    allDaysBefore.find(
      (day) =>
        String(day?.challenge_id || "") === activeChallengeIdBefore &&
        asDateValue(day?.trading_day_key || day?.trade_date) === closeTradingDayKey
    ) || null;
  const previousSavedStatus = normalizeDayStatus(previousSavedDay?.status);
  const previousSavedFinalized = Boolean(previousSavedDay?.finalized_at);
  const previousSavedTerminal =
    previousSavedStatus === DISCIPLINE_DAY_STATUS.CLEAN ||
    previousSavedStatus === DISCIPLINE_DAY_STATUS.NO_TRADE ||
    previousSavedStatus === DISCIPLINE_DAY_STATUS.BROKEN ||
    previousSavedStatus === DISCIPLINE_DAY_STATUS.NEEDS_REVIEW;
  const allowClosedDayRecalculation = Boolean(
    options?.allowClosedDayRecalculation ||
      options?.allow_closed_day_recalculation ||
      options?.forceRecalculateClosedDay ||
      options?.force_recalculate_closed_day
  );
  const progressBefore = {
    completedCleanDays: Math.max(0, asNumber(activeChallengeBefore?.completed_clean_days, 0)),
    streak: Math.max(0, asNumber(activeChallengeBefore?.current_streak, 0)),
    breaks: Math.max(0, asNumber(activeChallengeBefore?.rule_breaks, 0)),
  };

  if (previousSavedFinalized && previousSavedTerminal && !allowClosedDayRecalculation) {
    const evaluatedLocked = evaluateDisciplineState(project, {
      ...options,
      now,
      forceFinalize: false,
      closeTradingDayKey,
    });
    const lockedChallenge =
      evaluatedLocked.currentChallenge || evaluatedLocked.activeChallenge || null;
    const progressAfterLocked = {
      completedCleanDays: Math.max(0, asNumber(lockedChallenge?.completed_clean_days, 0)),
      streak: Math.max(0, asNumber(lockedChallenge?.current_streak, 0)),
      breaks: Math.max(0, asNumber(lockedChallenge?.rule_breaks, 0)),
    };
    return {
      ...evaluatedLocked,
      closeTradingDayKey,
      activeChallengeId: activeChallengeIdBefore,
      closingDay: previousSavedDay,
      normalizedDayTrades: [],
      collapsedNormalizedDayTrades: [],
      closeStatus: previousSavedStatus,
      closeDebug: {
        mode: String(options?.mode || "auto"),
        activeChallengeId: activeChallengeIdBefore,
        challengeDayId: String(previousSavedDay?.id || ""),
        requestedChallengeDayDate: requestedCloseTradingDayKey,
        selectedChallengeDayDate: closeTradingDayKey,
        localDateBeingClosed: localDateValue(now),
        mt5TradesFoundForDay: 0,
        rawTradeCount: 0,
        normalizedTradeCount: 0,
        hasExplicitBrokenSignal: false,
        calculatedStatus: previousSavedStatus,
        previousSavedStatus: String(previousSavedStatus || ""),
        savedDayStatus: String(previousSavedStatus || ""),
        finalSavedStatus: String(previousSavedStatus || ""),
        progressBefore,
        progressAfter: progressAfterLocked,
        alreadyFinalizedLock: true,
        lockReason: "already_finalized_terminal_day",
        trades: [],
      },
      error: "",
    };
  }

  const evaluated = evaluateDisciplineState(project, {
    ...options,
    now,
    forceFinalize: true,
    closeTradingDayKey,
  });

  const activeOrCurrentChallenge =
    evaluated.currentChallenge || evaluated.activeChallenge || null;
  if (!activeOrCurrentChallenge) {
    return {
      ...evaluated,
      closeTradingDayKey,
      error: "No active challenge found.",
    };
  }

  const allDays = Array.isArray(evaluated?.allChallengeDays)
    ? evaluated.allChallengeDays
    : [];
  const closingDay =
    allDays.find(
      (day) =>
        String(day?.challenge_id || "") === String(activeOrCurrentChallenge.id) &&
        asDateValue(day?.trading_day_key || day?.trade_date) === closeTradingDayKey
    ) || null;

  const allTrades = Array.isArray(evaluated?.project?.disciplineJournalTrades)
    ? evaluated.project.disciplineJournalTrades
    : [];
  const activeChallengeStartMs = getChallengeStartTimestampMs(activeOrCurrentChallenge);
  const challengeDayTrades = allTrades.filter((trade) => {
    if (String(trade?.discipline_challenge_id || "") !== String(activeOrCurrentChallenge.id)) {
      return false;
    }
    const dayKey = getTradeTradingDayKeyForEvaluation(trade, marketSettings);
    if (dayKey !== closeTradingDayKey) return false;
    const hasStableAttachedDayKey = Boolean(
      trade?.discipline_challenge_id && asDateValue(trade?.trading_day_key || trade?.tradingDayKey)
    );
    if (hasStableAttachedDayKey) return true;
    if (!Number.isFinite(activeChallengeStartMs) || activeChallengeStartMs <= 0) return true;
    const tradeEventMs = getTradeEventTimestampMsForChallenge(trade, marketSettings);
    if (!Number.isFinite(tradeEventMs) || tradeEventMs <= 0) return true;
    return tradeEventMs >= activeChallengeStartMs;
  });

  const normalizedDayTrades = challengeDayTrades
    .filter((trade) => {
      return isClosedDisciplineTrade(trade);
    })
    .map((trade) => ({
      id: trade?.id || "",
      source: inferTradeSource(trade),
      outcome: normalizeClosedTradeOutcome(trade?.outcome),
      date: trade?.date || "",
      time: trade?.time || "",
      importedAt: trade?.importedAt || trade?.imported_at || "",
      tradingDayKey: getTradeTradingDayKeyForEvaluation(trade, marketSettings),
      pair: trade?.pair || "",
      direction: trade?.direction || "",
      brokerTicket: trade?.brokerTicket || trade?.broker_ticket || "",
    }));
  const collapsedNormalizedDayTrades = collapseMt5SplitTrades(normalizedDayTrades);

  const hasExplicitBrokenSignal = challengeDayTrades.some(
    (trade) =>
      hasReadinessBreach(trade) ||
      Boolean(
        trade?.overtrade ||
          trade?.revenge_trade ||
          trade?.revengeTrade ||
          trade?.impulse_trade ||
          trade?.impulseTrade ||
          trade?.broken_rule ||
          trade?.brokenRule
      )
  );

  const fallbackStatus =
    collapsedNormalizedDayTrades.length === 0
      ? DISCIPLINE_DAY_STATUS.NO_TRADE
      : collapsedNormalizedDayTrades.length === 1
      ? DISCIPLINE_DAY_STATUS.CLEAN
      : collapsedNormalizedDayTrades.length > 1
      ? DISCIPLINE_DAY_STATUS.BROKEN
      : DISCIPLINE_DAY_STATUS.NEEDS_REVIEW;

  const resolvedCloseStatus = fallbackStatus || closingDay?.status || DISCIPLINE_DAY_STATUS.NEEDS_REVIEW;
  const finalSavedStatus = closingDay?.status || resolvedCloseStatus || DISCIPLINE_DAY_STATUS.NEEDS_REVIEW;
  const progressAfter = {
    completedCleanDays: Math.max(0, asNumber(activeOrCurrentChallenge?.completed_clean_days, 0)),
    streak: Math.max(0, asNumber(activeOrCurrentChallenge?.current_streak, 0)),
    breaks: Math.max(0, asNumber(activeOrCurrentChallenge?.rule_breaks, 0)),
  };
  const mt5TradesFoundForDay = challengeDayTrades.reduce(
    (count, trade) => (inferTradeSource(trade) === "mt5" ? count + 1 : count),
    0
  );

  const debugTrades = challengeDayTrades.map((trade) => {
    const timestamp = getTradeTimestamp(trade, marketSettings);
    return {
      id: trade?.id || "",
      source: inferTradeSource(trade),
      outcome: normalizeClosedTradeOutcome(trade?.outcome || ""),
      rawOutcome: String(trade?.outcome || ""),
      date: String(trade?.date || ""),
      time: String(trade?.time || ""),
      tradingDayKey: getTradeTradingDayKeyForEvaluation(trade, marketSettings),
      timestampIso: timestamp ? timestamp.toISOString() : "",
    };
  });

  return {
    ...evaluated,
    closeTradingDayKey,
    activeChallengeId: activeOrCurrentChallenge.id,
    closingDay,
    normalizedDayTrades,
    collapsedNormalizedDayTrades,
    closeStatus: resolvedCloseStatus,
    closeDebug: {
      mode: "auto",
      activeChallengeId: activeOrCurrentChallenge.id,
      challengeDayId: String(closingDay?.id || ""),
      requestedChallengeDayDate: requestedCloseTradingDayKey,
      selectedChallengeDayDate: closeTradingDayKey,
      localDateBeingClosed: localDateValue(now),
      mt5TradesFoundForDay,
      rawTradeCount: normalizedDayTrades.length,
      normalizedTradeCount: collapsedNormalizedDayTrades.length,
      hasExplicitBrokenSignal,
      calculatedStatus: resolvedCloseStatus,
      previousSavedStatus: String(previousSavedDay?.status || ""),
      savedDayStatus: finalSavedStatus,
      finalSavedStatus,
      progressBefore,
      progressAfter,
      trades: debugTrades,
    },
    error: "",
  };
}

export function prepareNextDisciplineRun(project, options = {}) {
  if (!project) return { project, nextChallenge: null, reused: false };

  const now = options.now ? new Date(options.now) : new Date();
  const nowIso = now.toISOString();
  const bindingProjectId = getDisciplineBindingProjectId(project);
  const marketSettings = normalizeDisciplineMarketSettings(project?.disciplineMarketSettings, bindingProjectId);
  const nowTradingDay = getGoldTradingDay(now, marketSettings);

  const challenges = Array.isArray(project?.disciplineChallenges)
    ? project.disciplineChallenges.map((item) => normalizeDisciplineChallenge(item, bindingProjectId))
    : [];
  if (challenges.length === 0) return { project, nextChallenge: null, reused: false };

  const sourceChallengeId = String(
    options.challengeId ||
      options.challenge_id ||
      getActiveDisciplineChallenge(project)?.id ||
      [...challenges]
        .sort(sortChallengesLatestFirst)
        .find((item) => item.status === DISCIPLINE_CHALLENGE_STATUS.BROKEN_FROZEN)?.id ||
      ""
  );
  if (!sourceChallengeId) return { project, nextChallenge: null, reused: false };

  const sourceChallenge = challenges.find((item) => item.id === sourceChallengeId);
  if (!sourceChallenge) return { project, nextChallenge: null, reused: false };

  const dayRows = Array.isArray(project?.disciplineDays)
    ? project.disciplineDays.map((item) => normalizeDisciplineDay(item, bindingProjectId, sourceChallenge.id))
    : [];
  const brokenRows = dayRows
    .filter(
      (day) =>
        day.challenge_id === sourceChallenge.id &&
        normalizeDayStatus(day.status) === DISCIPLINE_DAY_STATUS.BROKEN
    )
    .sort((a, b) =>
      asDateValue(a.trading_day_key || a.trade_date).localeCompare(
        asDateValue(b.trading_day_key || b.trade_date)
      )
    );
  const latestBrokenDayKey =
    asDateValue(options.brokenTradingDayKey || options.broken_trading_day_key) ||
    asDateValue(brokenRows.at(-1)?.trading_day_key || brokenRows.at(-1)?.trade_date) ||
    nowTradingDay.tradingDayKey;
  const scheduledDayKey = shiftDateKey(latestBrokenDayKey, 1);
  const shouldActivate = nowTradingDay.tradingDayKey >= scheduledDayKey;

  const existingPrepared = challenges.find(
    (item) =>
      item.prepared_from_challenge_id === sourceChallenge.id &&
      item.scheduled_for_trading_day === scheduledDayKey &&
      (item.status === DISCIPLINE_CHALLENGE_STATUS.SCHEDULED ||
        item.status === DISCIPLINE_CHALLENGE_STATUS.ACTIVE)
  );

  if (existingPrepared) {
    const nextStatus = shouldActivate
      ? DISCIPLINE_CHALLENGE_STATUS.ACTIVE
      : DISCIPLINE_CHALLENGE_STATUS.SCHEDULED;
    const nextChallenges = challenges.map((item) => {
      if (
        item.id === sourceChallenge.id &&
        (item.status === DISCIPLINE_CHALLENGE_STATUS.ACTIVE ||
          item.status === DISCIPLINE_CHALLENGE_STATUS.BROKEN_FROZEN)
      ) {
        return {
          ...item,
          status: DISCIPLINE_CHALLENGE_STATUS.ARCHIVED,
          archived_at: item.archived_at || nowIso,
          archive_reason: item.archive_reason || "Run ended after broken day",
          updated_at: nowIso,
        };
      }
      if (item.id === existingPrepared.id && item.status !== nextStatus) {
        return {
          ...item,
          status: nextStatus,
          updated_at: nowIso,
        };
      }
      return item;
    });

    return {
      project: {
        ...project,
        disciplineMarketSettings: marketSettings,
        disciplineChallenges: nextChallenges,
      },
      nextChallenge: nextChallenges.find((item) => item.id === existingPrepared.id) || existingPrepared,
      reused: true,
    };
  }

  const nextChallengeCounter = Math.max(0, asNumber(project?.disciplineChallengeCounter, 0)) + 1;
  const preparedChallenge = normalizeDisciplineChallenge(
    {
      target_clean_days: sourceChallenge.target_clean_days,
      completed_clean_days: 0,
      current_streak: 0,
      rule_breaks: 0,
      status: shouldActivate
        ? DISCIPLINE_CHALLENGE_STATUS.ACTIVE
        : DISCIPLINE_CHALLENGE_STATUS.SCHEDULED,
      restart_on_break: true,
      start_date: scheduledDayKey,
      challenge_name: `${sourceChallenge.target_clean_days} Clean Days Challenge`,
      challenge_number: nextChallengeCounter,
      prepared_from_challenge_id: sourceChallenge.id,
      scheduled_for_trading_day: scheduledDayKey,
      created_at: nowIso,
      updated_at: nowIso,
    },
    bindingProjectId
  );

  const archivedSourceChallenges = challenges.map((item) =>
    item.id === sourceChallenge.id
      ? {
          ...item,
          status: DISCIPLINE_CHALLENGE_STATUS.ARCHIVED,
          archived_at: item.archived_at || nowIso,
          archive_reason: item.archive_reason || "Run ended after broken day",
          updated_at: nowIso,
        }
      : item
  );

  return {
    project: {
      ...project,
      disciplineMarketSettings: marketSettings,
      disciplineChallenges: [preparedChallenge, ...archivedSourceChallenges],
      disciplineChallengeCounter: nextChallengeCounter,
    },
    nextChallenge: preparedChallenge,
    reused: false,
  };
}

export function getDisciplineDashboardMessage(summary) {
  if (!summary?.todayDay) {
    return "Today's winner is the trader who follows the rule.";
  }

  const status = summary.todayDay.status;
  if (status === DISCIPLINE_DAY_STATUS.BROKEN) {
    return "Today's rule was broken. Restart tomorrow with honesty, not shame.";
  }
  if (
    status === DISCIPLINE_DAY_STATUS.PENDING ||
    status === DISCIPLINE_DAY_STATUS.PENDING_CLEAN ||
    status === DISCIPLINE_DAY_STATUS.TRADE_TAKEN
  ) {
    return "Your trade is done.\nNow protect the rule until gold market close.";
  }
  if (status === DISCIPLINE_DAY_STATUS.MARKET_CLOSED) {
    return "Gold day closed.\nFinalization is waiting.";
  }
  if (status === DISCIPLINE_DAY_STATUS.CLEAN) {
    if (summary.todayFirstTradeOutcome === "SL") {
      return "SL hit is not failure.\nBreaking rules after SL is failure.";
    }
    return "You followed the rule.\nSo today you won.";
  }
  if (status === DISCIPLINE_DAY_STATUS.NO_TRADE) {
    return "No trade is also discipline.\nToday you protected capital and mind.";
  }
  if (status === DISCIPLINE_DAY_STATUS.NEEDS_REVIEW) {
    return "Yesterday needs review.\nCheck calmly when you are ready.";
  }
  return "Today's winner is the trader who follows the rule.";
}

export function getChallengeChecklist(activeChallenge, allChallengeDays = [], options = {}) {
  const target = Math.max(1, asNumber(activeChallenge?.target_clean_days, 0));
  const start = asDateValue(activeChallenge?.start_date) || localDateValue();
  const currentTradingDayKey = asDateValue(
    options.currentTradingDayKey || options.current_trading_day_key
  );
  const sequenceDays = Array.isArray(allChallengeDays)
    ? [...allChallengeDays]
        .filter((day) => {
          const status = normalizeDayStatus(day?.status);
          return (
            status === DISCIPLINE_DAY_STATUS.CLEAN ||
            status === DISCIPLINE_DAY_STATUS.NO_TRADE ||
            status === DISCIPLINE_DAY_STATUS.NEEDS_REVIEW ||
            status === DISCIPLINE_DAY_STATUS.BROKEN ||
            status === DISCIPLINE_DAY_STATUS.PENDING ||
            status === DISCIPLINE_DAY_STATUS.PENDING_CLEAN ||
            status === DISCIPLINE_DAY_STATUS.TRADE_TAKEN ||
            status === DISCIPLINE_DAY_STATUS.MARKET_CLOSED
          );
        })
        .sort((a, b) =>
          asDateValue(a?.trading_day_key || a?.trade_date).localeCompare(
            asDateValue(b?.trading_day_key || b?.trade_date)
          )
        )
    : [];

  const dayByKey = new Map(
    sequenceDays.map((day) => [asDateValue(day?.trading_day_key || day?.trade_date), day])
  );
  const firstBrokenKey =
    sequenceDays.find(
      (day) => normalizeDayStatus(day?.status) === DISCIPLINE_DAY_STATUS.BROKEN
    )?.trading_day_key ||
    sequenceDays.find(
      (day) => normalizeDayStatus(day?.status) === DISCIPLINE_DAY_STATUS.BROKEN
    )?.trade_date ||
    "";
  const normalizedFirstBrokenKey = asDateValue(firstBrokenKey);

  return Array.from({ length: target }, (_, index) => {
    const key = shiftDateKey(start, index);
    const isAfterBrokenBoundary =
      Boolean(normalizedFirstBrokenKey) && key > normalizedFirstBrokenKey;
    const day = isAfterBrokenBoundary ? null : dayByKey.get(key) || null;
    const rawStatus = normalizeDayStatus(day?.status);
    const status =
      currentTradingDayKey && key > currentTradingDayKey
        ? DISCIPLINE_DAY_STATUS.WAITING
        : rawStatus;
    let state = "WAITING";
    if (status === DISCIPLINE_DAY_STATUS.CLEAN) state = "CLEAN";
    else if (status === DISCIPLINE_DAY_STATUS.NO_TRADE) state = "NO_TRADE";
    else if (status === DISCIPLINE_DAY_STATUS.NEEDS_REVIEW) state = "NEEDS_REVIEW";
    else if (status === DISCIPLINE_DAY_STATUS.BROKEN) state = "BROKEN";
    else if (
      status === DISCIPLINE_DAY_STATUS.PENDING ||
      status === DISCIPLINE_DAY_STATUS.PENDING_CLEAN ||
      status === DISCIPLINE_DAY_STATUS.TRADE_TAKEN ||
      status === DISCIPLINE_DAY_STATUS.MARKET_CLOSED
    ) {
      state = "PENDING";
    }

    return {
      day: index + 1,
      tradingDayKey: key,
      state,
      done: state === "CLEAN" || state === "NO_TRADE",
      broken: state === "BROKEN",
      pending: state === "PENDING",
      label:
        state === "CLEAN"
          ? "Clean Trade Day"
          : state === "NO_TRADE"
          ? "No Trade Day"
          : state === "NEEDS_REVIEW"
          ? "Needs Review"
          : state === "BROKEN"
          ? "Broken Day"
          : state === "PENDING"
          ? "Pending"
          : "Waiting",
    };
  });
}
