import { useEffect, useMemo, useState } from "react";
import {
  DISCIPLINE_DAY_STATUS,
  evaluateDisciplineState,
  exitDisciplineChallenge,
  getActiveDisciplineChallenge,
  getCountdownToGoldClose,
  getChallengeChecklist,
  startDisciplineChallenge,
} from "../lib/disciplineUtils.js";

function classForDayState(state) {
  if (state === DISCIPLINE_DAY_STATUS.CLEAN) return "day-card clean";
  if (state === DISCIPLINE_DAY_STATUS.BROKEN) return "day-card broken";
  if (state === DISCIPLINE_DAY_STATUS.NO_TRADE) return "day-card no-trade";
  return "day-card";
}

function normalizeStatusLabel(state) {
  if (!state) return "Waiting";
  if (state === DISCIPLINE_DAY_STATUS.WAITING || state === "WAITING") return "Waiting";
  if (state === "PENDING") return "Pending";
  if (state === DISCIPLINE_DAY_STATUS.NO_TRADE) return "No Trade Day";
  if (state === DISCIPLINE_DAY_STATUS.PENDING_CLEAN) return "Pending";
  if (state === DISCIPLINE_DAY_STATUS.CLEAN) return "Clean Trade Day";
  if (state === DISCIPLINE_DAY_STATUS.BROKEN) return "Broken Day";
  return String(state).replaceAll("_", " ");
}

function formatDisplayDate(value) {
  const raw = String(value || "").slice(0, 10);
  const date = raw ? new Date(`${raw}T12:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMoney(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}`;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function OneTradeRulePage({ ruleState, liveTrades, onRuleChange }) {
  const [busy, setBusy] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const evaluation = useMemo(() => evaluateDisciplineState(ruleState, { now: new Date() }), [ruleState]);
  const project = evaluation?.project || ruleState;
  const countdown = useMemo(
    () => getCountdownToGoldClose(new Date(nowMs), project?.disciplineMarketSettings || {}),
    [nowMs, project?.disciplineMarketSettings]
  );
  const countdownLabel = useMemo(() => formatCountdown(countdown?.ms || 0), [countdown?.ms]);
  const goldDayLabel = useMemo(() => formatDisplayDate(countdown?.tradingDayKey || ""), [countdown?.tradingDayKey]);
  const activeChallenge = useMemo(() => getActiveDisciplineChallenge(project), [project]);
  const scopedChallengeDays = useMemo(() => {
    const allDays = Array.isArray(project?.disciplineDays) ? project.disciplineDays : [];
    if (!activeChallenge?.id) return [];
    return allDays.filter((day) => String(day?.challenge_id || "") === String(activeChallenge.id));
  }, [project?.disciplineDays, activeChallenge?.id]);
  const checklist = useMemo(
    () => {
      if (!activeChallenge?.id) return [];
      return getChallengeChecklist(activeChallenge, scopedChallengeDays, {
        now: new Date(),
      });
    },
    [activeChallenge?.id, activeChallenge, scopedChallengeDays]
  );

  const selectedDay = activeChallenge?.id
    ? selectedDayKey ||
      checklist?.find((item) => item.state !== DISCIPLINE_DAY_STATUS.WAITING)?.tradingDayKey ||
      checklist?.[0]?.tradingDayKey ||
      ""
    : "";
  const dayTrades = useMemo(() => {
    if (!selectedDay || !activeChallenge?.id) return [];
    const all = Array.isArray(project?.disciplineJournalTrades) ? project.disciplineJournalTrades : [];
    return all
      .filter((trade) => {
        const challengeMatch =
          String(trade?.discipline_challenge_id || "") === String(activeChallenge.id);
        const dayMatch =
          String(trade?.trading_day_key || "").slice(0, 10) === String(selectedDay).slice(0, 10);
        const include = challengeMatch && dayMatch;
        console.log("[OneTrade TradeFilter]", {
          ticket: String(trade?.brokerTicket || ""),
          challenge_id: String(trade?.discipline_challenge_id || ""),
          activeChallengeId: String(activeChallenge.id),
          trading_day_key: String(trade?.trading_day_key || "").slice(0, 10),
          includedInLive: false,
          includedInDayDetails: include,
          excludedReason: include ? "" : !challengeMatch ? "challenge_mismatch" : "selected_day_mismatch",
        });
        return include;
      })
      .sort((a, b) => new Date(b?.importedAt || 0).getTime() - new Date(a?.importedAt || 0).getTime());
  }, [project?.disciplineJournalTrades, selectedDay, activeChallenge?.id]);

  const challengeProgress = activeChallenge
    ? {
        completed: Number(activeChallenge.completed_clean_days || 0),
        target: Number(activeChallenge.target_clean_days || 5),
        streak: Number(activeChallenge.current_streak || 0),
        breaks: Number(activeChallenge.rule_breaks || 0),
        status: String(activeChallenge.status || "ACTIVE"),
      }
    : null;

  async function handleStartChallenge() {
    setBusy(true);
    try {
      const started = startDisciplineChallenge(project, {
        targetCleanDays: 5,
        challengeName: "5 Clean Days Challenge",
        now: new Date(),
      });
      const evaluated = evaluateDisciplineState(started, { now: new Date() }).project;
      await onRuleChange(evaluated, "Challenge started.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExitChallenge() {
    if (!activeChallenge?.id) return;
    setBusy(true);
    try {
      const exited = exitDisciplineChallenge(project);
      const evaluated = evaluateDisciplineState(exited, { now: new Date() }).project;
      await onRuleChange(evaluated, "Challenge exited.");
    } finally {
      setBusy(false);
    }
  }

  const brokenLiveTrades = liveTrades.filter((trade) => Number(trade?.oneTradeOrderNumber || 0) >= 2).length;

  return (
    <div className="row" style={{ gap: 16 }}>
      <section className="page-card row" style={{ gap: 12 }}>
        <div className="header-split">
          <div>
            <h1 className="section-title">One Trade Rule</h1>
            <p className="section-subtitle">ONE TRADE. ONE DECISION. NO REVENGE.</p>
          </div>
          <div className="discipline-countdown">
            <div className="label">Protect Your Discipline</div>
            <div className="value">{countdownLabel}</div>
            <div className="meta">Gold Day: {goldDayLabel || "--"}</div>
          </div>
        </div>
        {!activeChallenge ? (
          <div className="row">
            <p>No active challenge. Start your standalone challenge run.</p>
            <div>
              <button onClick={handleStartChallenge} disabled={busy}>
                {busy ? "Starting..." : "Start 5 Clean Days Challenge"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="summary-grid">
              <div className="stat">
                <div className="label">Progress</div>
                <div className="value">
                  {challengeProgress.completed}/{challengeProgress.target}
                </div>
              </div>
              <div className="stat">
                <div className="label">Status</div>
                <div className="value" style={{ fontSize: 24 }}>
                  {challengeProgress.status === "ACTIVE" ? "Active" : challengeProgress.status}
                </div>
              </div>
              <div className="stat">
                <div className="label">Streak</div>
                <div className="value">{challengeProgress.streak}</div>
              </div>
            </div>
            <div className="row" style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}>
              <small>
                Attempt #{activeChallenge.challenge_number || 1} • Breaks: {challengeProgress.breaks} • Live
                trades today: {liveTrades.length}
              </small>
              <button className="secondary-btn" onClick={handleExitChallenge} disabled={busy}>
                Exit Challenge
              </button>
            </div>
          </>
        )}
      </section>

      <section className="page-card row">
        <h2 className="section-title">Current Run</h2>
        <div className="card-grid">
          {checklist.map((day) => (
            <div
              key={`${day.day}-${day.tradingDayKey}`}
              className={classForDayState(day.state)}
              onClick={() => setSelectedDayKey(day.tradingDayKey)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedDayKey(day.tradingDayKey);
                }
              }}
              role="button"
              tabIndex={0}
              style={{ cursor: "pointer" }}
            >
              <div style={{ fontWeight: 700 }}>Day {day.day}</div>
              <div>{normalizeStatusLabel(day.state)}</div>
              <div className="meta">{formatDisplayDate(day.tradingDayKey)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="page-card row">
        <h2 className="section-title">Today&apos;s Trade (Live)</h2>
        <p className="section-subtitle">Live trades for the current open trading day.</p>
        {!liveTrades.length ? <div className="stat">No entries yet in this challenge journal.</div> : null}
        {liveTrades.map((trade) => (
          <article key={`${trade.id}-${trade.brokerTicket || ""}`} className="trade-card">
            <div>
              <div>
                <span className="badge">Trade</span>{" "}
                {Number(trade?.oneTradeOrderNumber || 0) >= 2 ? <span className="badge red">Overtrade</span> : null}
              </div>
              <strong>{trade.pair}</strong> • {trade.direction} • Gold Day: {trade.trading_day_key || trade.date}
              <div className="meta">MT5 broker date: {trade.date || "--"} • Ticket: {trade.brokerTicket || "--"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className={Number(trade.pnl || 0) < 0 ? "badge red" : "badge"}>{formatMoney(trade.pnl)}</div>
              <div className="meta">Lot {trade.lotSize || 0}</div>
            </div>
          </article>
        ))}
        {brokenLiveTrades > 0 ? <div className="notice error">Detected {brokenLiveTrades} overtrade entry(s).</div> : null}
      </section>

      <section className="page-card row">
        <h2 className="section-title">Day Details</h2>
        <p className="section-subtitle">{selectedDay ? formatDisplayDate(selectedDay) : "No day selected"}</p>
        {!dayTrades.length ? <div className="stat">No MT5 trades for this day.</div> : null}
        {dayTrades.map((trade) => (
          <article key={`detail-${trade.id}-${trade.brokerTicket || ""}`} className="trade-card">
            <div>
              <strong>{trade.pair}</strong> • {trade.direction} • Gold Day: {trade.trading_day_key || trade.date}
              <div className="meta">Broker date: {trade.date || "--"} {trade.time ? `• ${trade.time}` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>{formatMoney(trade.pnl)}</div>
          </article>
        ))}
      </section>
    </div>
  );
}
