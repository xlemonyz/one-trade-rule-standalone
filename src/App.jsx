import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient.js";
import { AuthGate } from "./components/AuthGate.jsx";
import { AppShell } from "./components/AppShell.jsx";
import { defaultOneTradeRuleState } from "./lib/stateDefaults.js";
import {
  buildChallengeLiveTrades,
  normalizeChallengeTradeSet,
  normalizeTradeRecord,
} from "./lib/oneTradeRuleEngine.js";
import { evaluateDisciplineState } from "./lib/disciplineUtils.js";
import {
  loadOneTradeState,
  saveOneTradeState,
  loadBrokerConnection,
  saveBrokerConnection,
  loadChallengeTrades,
} from "./lib/supabaseData.js";
import { OneTradeRulePage } from "./pages/OneTradeRulePage.jsx";
import { HistoryPage } from "./pages/HistoryPage.jsx";
import { MT5SyncPage } from "./pages/MT5SyncPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";

function buildEvaluatedRule(rawRule, trades) {
  return evaluateDisciplineState(
    {
      ...(rawRule || {}),
      disciplineJournalTrades: Array.isArray(trades) ? trades : [],
    },
    { now: new Date() }
  ).project;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [ruleState, setRuleState] = useState(defaultOneTradeRuleState(""));
  const [trades, setTrades] = useState([]);
  const [connection, setConnection] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function bootstrapUserData(userId) {
    setLoading(true);
    setError("");
    try {
      const [storedRule, brokerConn, tradeRows] = await Promise.all([
        loadOneTradeState(userId),
        loadBrokerConnection(userId),
        loadChallengeTrades(userId),
      ]);
      const normalizedTrades = (tradeRows || []).map(normalizeTradeRecord);
      const base = storedRule && typeof storedRule === "object" ? storedRule : defaultOneTradeRuleState(userId);
      const normalizedSet = normalizeChallengeTradeSet(base, normalizedTrades, new Date());
      const next = buildEvaluatedRule({ ...base, user_id: userId }, normalizedSet.trades);
      setRuleState(next);
      setTrades(normalizedSet.trades);
      setConnection(brokerConn);
      await saveOneTradeState(userId, next);
      if (!location.pathname || location.pathname === "/") {
        navigate("/one-trade-rule", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Failed to load user data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authReady) return;
    if (!session?.user?.id) {
      setRuleState(defaultOneTradeRuleState(""));
      setTrades([]);
      setConnection(null);
      setLoading(false);
      return;
    }
    bootstrapUserData(session.user.id);
  }, [authReady, session?.user?.id]);

  async function refreshFromCloud() {
    if (!session?.user?.id) return;
    setSyncing(true);
    setSuccess("");
    setError("");
    try {
      await bootstrapUserData(session.user.id);
      setSuccess("Synced latest MT5 trades and challenge state.");
    } catch (err) {
      setError(err.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function persistRule(nextRule, message = "State saved.") {
    if (!session?.user?.id) return;
    setRuleState(nextRule);
    setError("");
    try {
      await saveOneTradeState(session.user.id, nextRule);
      setSuccess(message);
    } catch (err) {
      setError(err.message || "Could not save state.");
    }
  }

  async function updateConnection(payload) {
    if (!session?.user?.id) return;
    setError("");
    try {
      const saved = await saveBrokerConnection(session.user.id, payload);
      setConnection(saved);
      setSuccess("MT5 connection saved.");
    } catch (err) {
      setError(err.message || "Could not save MT5 connection.");
    }
  }

  const liveTrades = useMemo(() => buildChallengeLiveTrades(ruleState), [ruleState]);

  if (!authReady) {
    return <div className="center-screen">Loading authentication...</div>;
  }

  if (!session?.user) {
    return <AuthGate />;
  }

  return (
    <AppShell
      user={session.user}
      syncing={syncing}
      onSync={refreshFromCloud}
      onSignOut={() => supabase.auth.signOut()}
      noticeError={error}
      noticeSuccess={success}
      onClearNotices={() => {
        setError("");
        setSuccess("");
      }}
    >
      {loading ? (
        <div className="center-screen">Loading One Trade Rule workspace...</div>
      ) : (
        <Routes>
          <Route
            path="/one-trade-rule"
            element={
              <OneTradeRulePage
                session={session}
                ruleState={ruleState}
                liveTrades={liveTrades}
                onRuleChange={persistRule}
              />
            }
          />
          <Route
            path="/history"
            element={<HistoryPage ruleState={ruleState} trades={trades} />}
          />
          <Route
            path="/mt5-sync"
            element={
              <MT5SyncPage
                connection={connection}
                onSaveConnection={updateConnection}
                onRefresh={refreshFromCloud}
                syncing={syncing}
              />
            }
          />
          <Route path="/settings" element={<SettingsPage user={session.user} />} />
          <Route path="*" element={<Navigate to="/one-trade-rule" replace />} />
        </Routes>
      )}
    </AppShell>
  );
}
