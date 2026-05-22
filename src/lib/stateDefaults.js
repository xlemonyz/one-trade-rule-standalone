import {
  DEFAULT_DISCIPLINE_MARKET_SETTINGS,
  DISCIPLINE_CHALLENGE_TYPE,
} from "./disciplineUtils.js";

export function defaultOneTradeRuleState(userId = "") {
  return {
    id: userId ? `one-trade-rule-${userId}` : "one-trade-rule",
    user_id: userId || "",
    disciplineModeEnabled: true,
    disciplineChallengeType: DISCIPLINE_CHALLENGE_TYPE,
    disciplineMarketSettings: { ...DEFAULT_DISCIPLINE_MARKET_SETTINGS },
    disciplineChallenges: [],
    disciplineDays: [],
    dailyCommitments: [],
    disciplineJournalTrades: [],
    disciplineTradeEvents: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
