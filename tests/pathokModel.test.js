import test from "node:test";
import assert from "node:assert/strict";
import {
  compactTranscript,
  filterPathokDocuments,
  getDocumentProgress,
  normalizeReadableTranscript,
  normalizePathokDocument,
  parseYouTubeVideoId,
  splitReadingText,
} from "../src/lib/pathokModel.js";
import {
  changeReaderFontSize,
  DEFAULT_READER_PREFERENCES,
  normalizeReaderPreferences,
  parseReaderPreferences,
} from "../src/lib/pathokReaderPreferences.js";

test("parses supported YouTube URL formats", () => {
  assert.equal(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYouTubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
});

test("normalizes Android-compatible transcript and progress fields", () => {
  const document = normalizePathokDocument({
    id: "doc", kind: "YOUTUBE", title: "Video", content: "বাংলা",
    readable_transcript: "First\n\nSecond", original_transcript: "First Second",
    transcript_status: "READY", scroll_index: 2, transcript_scroll_offset: 90,
    reading_progress_percent: 42, transcript_progress_percent: 99,
  });
  assert.equal(document.readableTranscript, "First\n\nSecond");
  assert.equal(document.originalTranscript, "First Second");
  assert.equal(document.scrollIndex, 2);
  assert.equal(document.transcriptScrollOffset, 90);
  assert.equal(document.readingProgressPercent, 42);
  assert.equal(document.transcriptProgressPercent, 100);
});

test("uses saved progress and falls back to paragraph position for older documents", () => {
  assert.equal(getDocumentProgress({ content: "One. Two. Three.", scrollIndex: 1, readingProgressPercent: null }), 50);
  assert.equal(getDocumentProgress({ content: "One.", scrollIndex: 0, readingProgressPercent: 61 }), 61);
  assert.equal(getDocumentProgress({ readableTranscript: "A. B. C.", transcriptScrollIndex: 2, transcriptProgressPercent: null }, "ENGLISH"), 100);
});

test("filters deleted documents and searches title or content", () => {
  const documents = [
    { id: "1", kind: "TEXT", title: "বাংলা note", content: "discipline", updatedAt: 1, deletedAt: null },
    { id: "2", kind: "YOUTUBE", title: "Trading", content: "", updatedAt: 3, deletedAt: null },
    { id: "3", kind: "TEXT", title: "Deleted", content: "discipline", updatedAt: 4, deletedAt: 4 },
  ];
  assert.deepEqual(filterPathokDocuments(documents, "discipline", "ALL").map((item) => item.id), ["1"]);
  assert.deepEqual(filterPathokDocuments(documents, "", "YOUTUBE").map((item) => item.id), ["2"]);
});

test("keeps explicit timestamp segments as readable paragraphs", () => {
  assert.deepEqual(splitReadingText("First caption\n\nSecond caption"), ["First caption", "Second caption"]);
  assert.deepEqual(splitReadingText("First sentence. Second sentence."), ["First sentence.", "Second sentence."]);
});

test("creates readable and compact forms from a manual transcript", () => {
  const readable = normalizeReadableTranscript(" First segment \r\n\r\n\r\n Second   segment \n final line ");
  assert.equal(readable, "First segment\n\nSecond   segment\nfinal line");
  assert.equal(compactTranscript(readable), "First segment Second segment final line");
});

test("validates persisted reader preferences", () => {
  assert.deepEqual(parseReaderPreferences("not-json"), DEFAULT_READER_PREFERENCES);
  assert.deepEqual(normalizeReaderPreferences({ theme: "UNKNOWN", width: "WIDE", banglaFontSize: 80 }), {
    theme: "PAPER", width: "WIDE", banglaFontSize: 30, englishFontSize: 18,
  });
});

test("changes only the active language font size within limits", () => {
  const larger = changeReaderFontSize(DEFAULT_READER_PREFERENCES, "ENGLISH", 2);
  assert.equal(larger.englishFontSize, 20);
  assert.equal(larger.banglaFontSize, 20);
  assert.equal(changeReaderFontSize({ ...larger, englishFontSize: 30 }, "ENGLISH", 2).englishFontSize, 30);
});
