export const READER_THEMES = Object.freeze(["PAPER", "WHITE", "NIGHT"]);
export const READER_WIDTHS = Object.freeze({ NARROW: 620, COMFORTABLE: 740, WIDE: 880 });
export const DEFAULT_READER_PREFERENCES = Object.freeze({
  theme: "PAPER",
  width: "COMFORTABLE",
  banglaFontSize: 20,
  englishFontSize: 18,
});

function clampFontSize(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(30, Math.max(16, Math.round(parsed))) : fallback;
}

export function normalizeReaderPreferences(value = {}) {
  return {
    theme: READER_THEMES.includes(value?.theme) ? value.theme : DEFAULT_READER_PREFERENCES.theme,
    width: Object.hasOwn(READER_WIDTHS, value?.width) ? value.width : DEFAULT_READER_PREFERENCES.width,
    banglaFontSize: clampFontSize(value?.banglaFontSize, DEFAULT_READER_PREFERENCES.banglaFontSize),
    englishFontSize: clampFontSize(value?.englishFontSize, DEFAULT_READER_PREFERENCES.englishFontSize),
  };
}

export function parseReaderPreferences(serialized) {
  try {
    return normalizeReaderPreferences(JSON.parse(serialized || "{}"));
  } catch {
    return { ...DEFAULT_READER_PREFERENCES };
  }
}

export function changeReaderFontSize(preferences, language, delta) {
  const normalized = normalizeReaderPreferences(preferences);
  const key = language === "BANGLA" ? "banglaFontSize" : "englishFontSize";
  return normalizeReaderPreferences({ ...normalized, [key]: normalized[key] + delta });
}
