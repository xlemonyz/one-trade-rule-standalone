import { useEffect, useMemo, useState } from "react";

const ENDED_STATUS = new Set(["ARCHIVED", "COMPLETED", "FAILED"]);

function asDateKey(value) {
  return String(value || "").slice(0, 10);
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDate(value) {
  const key = asDateKey(value);
  if (!key) return "--";
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMoney(value) {
  const amount = Number(value || 0);
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toFixed(2)}`;
}

function normalizeChallenge(item) {
  const challenge = item && typeof item === "object" ? item : {};
  const status = String(challenge.status || "ACTIVE").toUpperCase();
  return {
    id: String(challenge.id || ""),
    challengeNumber: Math.max(1, asNumber(challenge.challenge_number || challenge.challengeNumber, 1)),
    status,
    startDate: asDateKey(challenge.start_date || challenge.startDate),
    completedAt: String(challenge.completed_at || challenge.completedAt || ""),
    archivedAt: String(challenge.archived_at || challenge.archivedAt || ""),
    archiveReason: String(challenge.archive_reason || challenge.archiveReason || ""),
    completedCleanDays: Math.max(0, asNumber(challenge.completed_clean_days || challenge.completedCleanDays, 0)),
    targetCleanDays: Math.max(1, asNumber(challenge.target_clean_days || challenge.targetCleanDays, 1)),
    currentStreak: Math.max(0, asNumber(challenge.current_streak || challenge.currentStreak, 0)),
    ruleBreaks: Math.max(0, asNumber(challenge.rule_breaks || challenge.ruleBreaks, 0)),
    createdAt: String(challenge.created_at || challenge.createdAt || ""),
    updatedAt: String(challenge.updated_at || challenge.updatedAt || ""),
  };
}

function normalizeTrade(row) {
  const payload = row?.data && typeof row.data === "object" ? row.data : {};
  const merged = { ...payload, ...row };
  return {
    id: String(merged.id || payload.id || ""),
    pair: String(merged.pair || merged.symbol || payload.pair || payload.symbol || "XAUUSD"),
    direction: String(merged.direction || payload.direction || "").toUpperCase(),
    lot: Number(merged.lotSize ?? merged.lot_size ?? payload.lotSize ?? payload.lot_size ?? 0) || 0,
    pnl: Number(merged.pnl ?? merged.profit ?? payload.pnl ?? payload.profit ?? 0) || 0,
    tradingDayKey: asDateKey(merged.trading_day_key || merged.tradingDayKey || payload.trading_day_key),
    brokerDate: asDateKey(merged.date || payload.date || merged.broker_trade_date || payload.broker_trade_date),
    brokerTime: String(merged.time || payload.time || merged.broker_trade_time || payload.broker_trade_time || ""),
    brokerTicket: String(
      merged.brokerTicket ||
        merged.broker_ticket ||
        payload.brokerTicket ||
        payload.broker_ticket ||
        payload.ticket ||
        ""
    ),
    brokerServer: String(merged.brokerServer || merged.broker_server || payload.brokerServer || payload.broker_server || ""),
    brokerAccountNumber: String(
      merged.brokerAccountNumber ||
        merged.broker_account_number ||
        payload.brokerAccountNumber ||
        payload.broker_account_number ||
        ""
    ),
    source: String(merged.source || payload.source || "mt5").toUpperCase(),
    challengeId: String(
      merged.discipline_challenge_id ||
        merged.challenge_id ||
        merged.challengeId ||
        payload.discipline_challenge_id ||
        payload.challenge_id ||
        ""
    ),
  };
}

function normalizeDay(row) {
  const day = row && typeof row === "object" ? row : {};
  return {
    id: String(day.id || ""),
    challengeId: String(day.challenge_id || day.challengeId || ""),
    tradingDayKey: asDateKey(day.trading_day_key || day.tradingDayKey || day.trade_date || day.tradeDate),
    status: String(day.status || "WAITING"),
  };
}

export function HistoryPage({ ruleState, trades }) {
  const challengeList = useMemo(() => {
    const source = Array.isArray(ruleState?.disciplineChallenges) ? ruleState.disciplineChallenges : [];
    return source
      .map(normalizeChallenge)
      .filter((challenge) => challenge.id)
      .sort((a, b) => {
        const aEnded = ENDED_STATUS.has(a.status) ? 1 : 0;
        const bEnded = ENDED_STATUS.has(b.status) ? 1 : 0;
        if (aEnded !== bEnded) return bEnded - aEnded;
        if (a.challengeNumber !== b.challengeNumber) return b.challengeNumber - a.challengeNumber;
        return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
      });
  }, [ruleState?.disciplineChallenges]);

  const [selectedChallengeId, setSelectedChallengeId] = useState("");

  useEffect(() => {
    if (!challengeList.length) {
      if (selectedChallengeId) setSelectedChallengeId("");
      return;
    }
    const exists = challengeList.some((item) => item.id === selectedChallengeId);
    if (!exists) setSelectedChallengeId(challengeList[0].id);
  }, [challengeList, selectedChallengeId]);

  const selectedChallenge = useMemo(
    () => challengeList.find((item) => item.id === selectedChallengeId) || null,
    [challengeList, selectedChallengeId]
  );

  const allTrades = useMemo(() => {
    const fromState = Array.isArray(ruleState?.disciplineJournalTrades) ? ruleState.disciplineJournalTrades : [];
    const fromRows = Array.isArray(trades) ? trades : [];
    return [...fromState, ...fromRows].map(normalizeTrade);
  }, [ruleState?.disciplineJournalTrades, trades]);

  const allDays = useMemo(() => {
    const source = Array.isArray(ruleState?.disciplineDays) ? ruleState.disciplineDays : [];
    return source.map(normalizeDay);
  }, [ruleState?.disciplineDays]);

  const challengeTradeCount = useMemo(() => {
    const counts = new Map();
    for (const trade of allTrades) {
      const key = trade.challengeId;
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [allTrades]);

  const selectedDays = useMemo(() => {
    if (!selectedChallenge?.id) return [];
    return allDays
      .filter((day) => day.challengeId === selectedChallenge.id && day.tradingDayKey)
      .sort((a, b) => a.tradingDayKey.localeCompare(b.tradingDayKey));
  }, [allDays, selectedChallenge?.id]);

  const selectedTrades = useMemo(() => {
    if (!selectedChallenge?.id) return [];
    return allTrades.filter((trade) => trade.challengeId === selectedChallenge.id);
  }, [allTrades, selectedChallenge?.id]);

  const groupedSections = useMemo(() => {
    if (!selectedChallenge?.id) return [];
    const tradesByKey = new Map();
    for (const trade of selectedTrades) {
      const key = trade.tradingDayKey || "UNKEYED";
      const list = tradesByKey.get(key) || [];
      list.push(trade);
      tradesByKey.set(key, list);
    }

    const orderedKeys = [];
    for (const day of selectedDays) {
      if (!orderedKeys.includes(day.tradingDayKey)) orderedKeys.push(day.tradingDayKey);
    }

    const extraKeys = [...tradesByKey.keys()]
      .filter((key) => key !== "UNKEYED" && !orderedKeys.includes(key))
      .sort();
    orderedKeys.push(...extraKeys);

    if (tradesByKey.has("UNKEYED")) orderedKeys.push("UNKEYED");

    return orderedKeys.map((key, index) => ({
      key,
      dayNumber: index + 1,
      day: selectedDays.find((item) => item.tradingDayKey === key) || null,
      trades: tradesByKey.get(key) || [],
    }));
  }, [selectedChallenge?.id, selectedDays, selectedTrades]);

  return (
    <div className="row" style={{ gap: 16 }}>
      <section className="page-card row history-card" style={{ gap: 10 }}>
        <h1 className="section-title">Challenge History</h1>
        <p className="section-subtitle">Read-only archive of all one-trade challenge attempts.</p>
        {!challengeList.length ? <div className="stat">No challenge attempts found yet.</div> : null}
        <div className="history-attempt-grid">
          {challengeList.map((challenge) => {
            const endDate = challenge.completedAt || challenge.archivedAt;
            const tradeCount = challengeTradeCount.get(challenge.id) || 0;
            const ended = ENDED_STATUS.has(challenge.status);
            return (
              <button
                key={challenge.id}
                type="button"
                className={`history-attempt-card${selectedChallengeId === challenge.id ? " active" : ""}`}
                onClick={() => setSelectedChallengeId(challenge.id)}
              >
                <div className="history-attempt-top">
                  <div className="history-attempt-title">Attempt #{challenge.challengeNumber}</div>
                  <span className={`history-status-pill${ended ? " ended" : " live"}`}>{challenge.status}</span>
                </div>
                <div className="history-attempt-meta">Start: {formatDate(challenge.startDate)}</div>
                <div className="history-attempt-meta">End: {formatDate(endDate)}</div>
                <div className="history-attempt-stats">
                  <span>{challenge.completedCleanDays}/{challenge.targetCleanDays}</span>
                  <span>Streak {challenge.currentStreak}</span>
                  <span>Breaks {challenge.ruleBreaks}</span>
                  <span>Trades {tradeCount}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="page-card row history-card" style={{ gap: 10 }}>
        <h2 className="section-title">Challenge Report</h2>
        {!selectedChallenge ? (
          <div className="stat">Select a challenge attempt to view report.</div>
        ) : (
          <>
            <article className="stat">
              <div className="history-summary-grid">
                <div><strong>Attempt</strong>: #{selectedChallenge.challengeNumber}</div>
                <div><strong>Status</strong>: {selectedChallenge.status}</div>
                <div><strong>Start</strong>: {formatDate(selectedChallenge.startDate)}</div>
                <div><strong>End</strong>: {formatDate(selectedChallenge.completedAt || selectedChallenge.archivedAt)}</div>
                <div><strong>Progress</strong>: {selectedChallenge.completedCleanDays}/{selectedChallenge.targetCleanDays}</div>
                <div><strong>Streak</strong>: {selectedChallenge.currentStreak}</div>
                <div><strong>Breaks</strong>: {selectedChallenge.ruleBreaks}</div>
                <div><strong>Total Trades</strong>: {selectedTrades.length}</div>
              </div>
            </article>

            <div className="row history-day-report" style={{ gap: 10 }}>
              {!groupedSections.length ? <div className="stat">No day/trade records for this challenge.</div> : null}
              {groupedSections.map((section) => (
                <section key={`${selectedChallenge.id}-${section.key}`} className="history-day-section">
                  <header className="history-day-header">
                    <div className="history-day-title">Day {section.dayNumber}</div>
                    <div className="history-day-meta">
                      {section.key === "UNKEYED" ? "Unkeyed" : formatDate(section.key)} • Status: {section.day?.status || "NO_DAY_ROW"}
                    </div>
                  </header>
                  {!section.trades.length ? <div className="stat">No trades attached to this day.</div> : null}
                  {section.trades.map((trade) => (
                    <article
                      key={`${section.key}-${trade.id}-${trade.brokerTicket}`}
                      className="trade-card"
                    >
                      <div>
                        <strong>{trade.pair}</strong> • {trade.direction || "--"} • Gold Day: {trade.tradingDayKey || "--"}
                        <div className="meta">
                          Broker date: {trade.brokerDate || "--"}{trade.brokerTime ? ` • ${trade.brokerTime}` : ""}
                          {" • "}Ticket: {trade.brokerTicket || "--"}
                        </div>
                        <div className="meta">
                          Source: {trade.source || "MT5"} • Server: {trade.brokerServer || "--"} • Account: {trade.brokerAccountNumber || "--"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 600 }}>{formatMoney(trade.pnl)}</div>
                        <div className="meta">Lot {trade.lot || 0}</div>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

