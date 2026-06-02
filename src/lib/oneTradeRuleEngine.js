import {
  getActiveDisciplineChallenge,
  getCountdownToGoldClose,
  getTradeEventTimestampMsForChallenge,
  getTradeTradingDayKey,
  normalizeDisciplineMarketSettings,
} from "./disciplineUtils.js";
import { localDateValue } from "./journalUtils.js";

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDayDiff(left, right) {
  const a = String(left || "").slice(0, 10);
  const b = String(right || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const aMs = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  const bMs = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
  return Math.round((aMs - bMs) / 86400000);
}

export function normalizeTradeRecord(trade) {
  const payload = trade?.data && typeof trade.data === "object" ? trade.data : {};
  const merged = { ...payload, ...trade };
  const id = String(
    merged.id ||
      payload.id ||
      payload.ticket ||
      payload.brokerTicket ||
      `trade-${Math.random().toString(36).slice(2, 10)}`
  );
  const importedAt = String(
    merged.importedAt ||
      merged.imported_at ||
      payload.importedAt ||
      payload.imported_at ||
      merged.created_at ||
      ""
  );
  return {
    ...merged,
    id,
    source: String(merged.source || payload.source || "").toLowerCase() || "manual",
    pair: String(merged.pair || payload.pair || merged.symbol || payload.symbol || "XAUUSD"),
    direction: String(
      merged.direction ||
        payload.direction ||
        (String(merged.type || payload.type || "").toLowerCase() === "sell" ? "SELL" : "BUY")
    ).toUpperCase(),
    date: String(merged.date || payload.date || "").slice(0, 10),
    time: String(merged.time || payload.time || ""),
    brokerTicket: String(
      merged.brokerTicket || merged.broker_ticket || payload.brokerTicket || payload.broker_ticket || payload.ticket || ""
    ),
    brokerAccountNumber: String(
      merged.brokerAccountNumber ||
        merged.broker_account_number ||
        payload.brokerAccountNumber ||
        payload.broker_account_number ||
        ""
    ),
    brokerServer: String(
      merged.brokerServer || merged.broker_server || payload.brokerServer || payload.broker_server || ""
    ),
    importedAt,
    trading_day_key: String(merged.trading_day_key || merged.tradingDayKey || payload.trading_day_key || "").slice(0, 10),
    discipline_challenge_id: String(merged.discipline_challenge_id || merged.challenge_id || ""),
    broker_trade_date: String(merged.broker_trade_date || "").slice(0, 10),
    broker_trade_time: String(merged.broker_trade_time || ""),
    entryPrice: Number(merged.entryPrice ?? merged.entry_price ?? payload.entryPrice ?? 0) || 0,
    closePrice: Number(merged.closePrice ?? merged.close_price ?? payload.closePrice ?? 0) || 0,
    lotSize: Number(merged.lotSize ?? merged.lot_size ?? payload.lotSize ?? 0) || 0,
    pnl: Number(merged.pnl ?? merged.profit ?? payload.pnl ?? payload.profit ?? 0) || 0,
    outcome: String(merged.outcome || payload.outcome || "Manual"),
  };
}

function isMt5Trade(trade) {
  const source = String(trade?.source || "").toLowerCase();
  return source === "mt5" || source.includes("auto imported");
}

function getLegacyTicket(trade) {
  return String(trade?.brokerTicket || trade?.broker_ticket || "").trim();
}

function normalizeScopePart(value) {
  const raw = String(value || "").trim();
  return raw || "__missing__";
}

function getScopedTicketKey(trade) {
  const ticket = getLegacyTicket(trade);
  if (!ticket) return "";
  const account = normalizeScopePart(trade?.brokerAccountNumber || trade?.broker_account_number);
  const server = normalizeScopePart(trade?.brokerServer || trade?.broker_server);
  return `${account}|${server}|${ticket}`;
}

function getTicketLookupKeys(trade) {
  const scoped = getScopedTicketKey(trade);
  const legacy = getLegacyTicket(trade);
  const keys = [];
  if (scoped) keys.push(`scoped:${scoped}`);
  if (legacy) keys.push(`legacy:${legacy}`);
  return keys;
}

function getOneTradeDuplicateKey(trade) {
  const scopedTicket = getScopedTicketKey(trade);
  if (scopedTicket) return `ticket:${scopedTicket}`;
  const date = String(trade?.date || "");
  const time = String(trade?.time || "");
  const pair = String(trade?.pair || "");
  const direction = String(trade?.direction || "");
  const entry = String(trade?.entryPrice || "");
  const lot = String(trade?.lotSize || "");
  const imported = String(trade?.importedAt || trade?.imported_at || "");
  return `sig:${date}|${time}|${pair}|${direction}|${entry}|${lot}|${imported}`;
}

function resolveMt5TradeDayKey(trade, marketSettings, currentGoldDayKey = "", fallbackLocalDate = "") {
  const explicit = String(trade?.trading_day_key || trade?.tradingDayKey || "").slice(0, 10);
  if (explicit) return explicit;

  const importedAtRaw = String(trade?.importedAt || trade?.imported_at || "");
  const importedAt = asDate(importedAtRaw);
  if (importedAt) {
    const importedGoldDay = String(getCountdownToGoldClose(importedAt, marketSettings)?.tradingDayKey || "").slice(0, 10);
    if (importedGoldDay) return importedGoldDay;
    const importedLocalDay = localDateValue(importedAt);
    if (importedLocalDay) return importedLocalDay;
  }

  const computed = String(getTradeTradingDayKey(trade, marketSettings) || "").slice(0, 10);
  if (computed) return computed;

  const brokerDate = String(trade?.date || "").slice(0, 10);
  if (brokerDate) return brokerDate;

  return currentGoldDayKey || fallbackLocalDate || "";
}

export function normalizeChallengeTradeSet(sourceRule, sourceTrades, nowDate = new Date()) {
  const rule = sourceRule && typeof sourceRule === "object" ? sourceRule : {};
  const marketSettings = normalizeDisciplineMarketSettings(rule?.disciplineMarketSettings || {}, rule?.id || "");
  const currentGoldDayKey = String(getCountdownToGoldClose(nowDate, marketSettings)?.tradingDayKey || "").slice(0, 10);
  const todayLocalDate = localDateValue(nowDate);

  const incoming = Array.isArray(sourceTrades) ? sourceTrades.map(normalizeTradeRecord) : [];
  const dedupe = new Set();
  const normalized = [];
  let changed = false;

  for (const trade of incoming) {
    const normalizedTrade = normalizeTradeRecord(trade);
    const nextDayKey = resolveMt5TradeDayKey(normalizedTrade, marketSettings, currentGoldDayKey, todayLocalDate);
    const hasPersistedKey = Boolean(String(normalizedTrade.trading_day_key || "").slice(0, 10));
    const withKey =
      !hasPersistedKey && nextDayKey && nextDayKey !== normalizedTrade.trading_day_key
        ? normalizeTradeRecord({ ...normalizedTrade, trading_day_key: nextDayKey })
        : normalizedTrade;

    if (withKey.trading_day_key !== normalizedTrade.trading_day_key) changed = true;

    // Challenge-only duplicate guard: same challenge + same ticket should keep one record.
    const challengeId = String(withKey.discipline_challenge_id || withKey.challenge_id || "").trim();
    const scopedTicket = getScopedTicketKey(withKey);
    const key = challengeId && scopedTicket ? `challenge-ticket:${challengeId}:${scopedTicket}` : getOneTradeDuplicateKey(withKey);
    if (key && dedupe.has(key)) {
      changed = true;
      continue;
    }
    if (key) dedupe.add(key);
    normalized.push(withKey);
  }

  return { trades: normalized, changed };
}

export function attachMt5TradesToActiveChallenge(sourceRule, sourceTrades, nowDate = new Date()) {
  const rule = sourceRule && typeof sourceRule === "object" ? sourceRule : {};
  const trades = Array.isArray(sourceTrades) ? sourceTrades.map(normalizeTradeRecord) : [];
  const challenge = getActiveDisciplineChallenge(rule);
  if (!challenge?.id) {
    return { rule, changed: false, attachedCount: 0 };
  }

  const marketSettings = normalizeDisciplineMarketSettings(rule?.disciplineMarketSettings || {}, rule?.id || "");
  const currentGoldDayKey = String(getCountdownToGoldClose(nowDate, marketSettings)?.tradingDayKey || "").slice(0, 10);
  const todayLocalDate = localDateValue(nowDate);

  const challengeStartDate = asDate(challenge?.created_at || challenge?.updated_at || challenge?.start_at);
  const challengeStartMs = challengeStartDate?.getTime() || 0;
  const challengeId = String(challenge.id);

  const existing = Array.isArray(rule?.disciplineJournalTrades)
    ? rule.disciplineJournalTrades.map(normalizeTradeRecord)
    : [];
  const dedupe = new Set(existing.map(getOneTradeDuplicateKey));
  const ticketChallengeMap = new Map();
  existing.forEach((trade) => {
    const mappedChallenge = String(trade?.discipline_challenge_id || "");
    getTicketLookupKeys(trade).forEach((lookupKey) => {
      if (!ticketChallengeMap.has(lookupKey)) ticketChallengeMap.set(lookupKey, mappedChallenge);
    });
  });

  const blockedBeforeStart = new Set(
    (Array.isArray(challenge?.blocked_mt5_tickets_before_start) ? challenge.blocked_mt5_tickets_before_start : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );

  const attached = [];
  let changed = false;
  for (const trade of trades) {
    if (!isMt5Trade(trade)) continue;
    const ticket = getLegacyTicket(trade);
    const scopedTicket = getScopedTicketKey(trade);
    if ((scopedTicket && blockedBeforeStart.has(scopedTicket)) || (ticket && blockedBeforeStart.has(ticket))) continue;

    const duplicateKey = getOneTradeDuplicateKey(trade);
    if (duplicateKey && dedupe.has(duplicateKey)) continue;

    const lookupKeys = getTicketLookupKeys(trade);
    const alreadyMappedChallenge = lookupKeys.reduce((found, key) => {
      if (found) return found;
      return String(ticketChallengeMap.get(key) || "");
    }, "");
    if (lookupKeys.length > 0 && alreadyMappedChallenge && alreadyMappedChallenge !== challengeId) continue;

    const eventMs = getTradeEventTimestampMsForChallenge(trade, marketSettings);
    const importedMs = asDate(trade?.importedAt)?.getTime() || 0;
    const effectiveMs = Number.isFinite(eventMs) && eventMs > 0 ? eventMs : importedMs;
    if (challengeStartMs > 0 && effectiveMs > 0 && effectiveMs < challengeStartMs) {
      if (scopedTicket) blockedBeforeStart.add(scopedTicket);
      else if (ticket) blockedBeforeStart.add(ticket);
      continue;
    }

    const dayKey = resolveMt5TradeDayKey(trade, marketSettings, currentGoldDayKey, todayLocalDate);
    if (!dayKey) continue;

    const brokerDate = String(trade?.date || "").slice(0, 10);
    if (brokerDate) {
      const drift = getDayDiff(brokerDate, dayKey);
      if (drift !== null && Math.abs(drift) > 1) continue;
    }

    const attachedTrade = normalizeTradeRecord({
      ...trade,
      discipline_challenge_id: challengeId,
      trading_day_key: dayKey,
      broker_trade_date: brokerDate || String(trade?.broker_trade_date || "").slice(0, 10),
      broker_trade_time: String(trade?.time || trade?.broker_trade_time || ""),
      attached_at: new Date().toISOString(),
    });
    attached.push(attachedTrade);
    changed = true;
    if (duplicateKey) dedupe.add(duplicateKey);
    lookupKeys.forEach((key) => ticketChallengeMap.set(key, challengeId));
  }

  if (!changed && blockedBeforeStart.size === (challenge?.blocked_mt5_tickets_before_start || []).length) {
    return { rule, changed: false, attachedCount: 0 };
  }

  const nextChallenges = Array.isArray(rule?.disciplineChallenges)
    ? rule.disciplineChallenges.map((item) =>
        item?.id === challengeId
          ? {
              ...item,
              blocked_mt5_tickets_before_start: Array.from(blockedBeforeStart),
              updated_at: new Date().toISOString(),
            }
          : item
      )
    : [];

  return {
    rule: {
      ...rule,
      disciplineChallenges: nextChallenges,
      disciplineJournalTrades: [...existing, ...attached],
      updated_at: new Date().toISOString(),
    },
    changed: changed || nextChallenges.length > 0,
    attachedCount: attached.length,
  };
}

export function buildChallengeLiveTrades(ruleState, nowDate = new Date()) {
  const rule = ruleState && typeof ruleState === "object" ? ruleState : {};
  const marketSettings = normalizeDisciplineMarketSettings(rule?.disciplineMarketSettings || {}, rule?.id || "");
  const activeChallenge = getActiveDisciplineChallenge(rule);
  if (!activeChallenge?.id) return [];

  const currentGoldDayKey = String(getCountdownToGoldClose(nowDate, marketSettings)?.tradingDayKey || "").slice(0, 10);
  const trades = Array.isArray(rule?.disciplineJournalTrades)
    ? rule.disciplineJournalTrades.map(normalizeTradeRecord)
    : [];

  const challengeTrades = trades.filter((trade) => {
    const include = String(trade?.discipline_challenge_id || "") === String(activeChallenge.id);
    if (!include) {
      console.log("[OneTrade TradeFilter]", {
        ticket: String(trade?.brokerTicket || ""),
        challenge_id: String(trade?.discipline_challenge_id || ""),
        activeChallengeId: String(activeChallenge.id),
        trading_day_key: String(trade?.trading_day_key || ""),
        includedInLive: false,
        includedInDayDetails: false,
        excludedReason: "challenge_mismatch",
      });
    }
    return include;
  });
  const liveTrades = challengeTrades.filter((trade) => {
    const dayKey = String(trade?.trading_day_key || "").slice(0, 10);
    const include = Boolean(dayKey && dayKey === currentGoldDayKey);
    console.log("[OneTrade TradeFilter]", {
      ticket: String(trade?.brokerTicket || ""),
      challenge_id: String(trade?.discipline_challenge_id || ""),
      activeChallengeId: String(activeChallenge.id),
      trading_day_key: dayKey,
      includedInLive: include,
      includedInDayDetails: false,
      excludedReason: include ? "" : "trading_day_mismatch_for_live",
    });
    return include;
  });

  return liveTrades.sort((a, b) => {
    const aMs = asDate(a?.importedAt)?.getTime() || 0;
    const bMs = asDate(b?.importedAt)?.getTime() || 0;
    return bMs - aMs;
  });
}
