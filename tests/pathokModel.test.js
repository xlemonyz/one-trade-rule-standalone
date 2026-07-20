import test from "node:test";
import assert from "node:assert/strict";
import {
  filterPathokDocuments,
  normalizePathokDocument,
  parseYouTubeVideoId,
  splitReadingText,
} from "../src/lib/pathokModel.js";

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
  });
  assert.equal(document.readableTranscript, "First\n\nSecond");
  assert.equal(document.originalTranscript, "First Second");
  assert.equal(document.scrollIndex, 2);
  assert.equal(document.transcriptScrollOffset, 90);
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
