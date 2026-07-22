import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  generatePathokTranscript,
  getYouTubeMetadata,
  loadPathokDocuments,
  patchPathokDocument,
  savePathokDocument,
  softDeletePathokDocument,
  subscribeToPathokDocuments,
} from "../lib/pathokData.js";
import {
  compactTranscript,
  filterPathokDocuments,
  getDocumentProgress,
  normalizeReadableTranscript,
  parseYouTubeVideoId,
  PATHOK_KIND,
  splitReadingText,
  TRANSCRIPT_STATUS,
} from "../lib/pathokModel.js";
import {
  changeReaderFontSize,
  parseReaderPreferences,
  READER_WIDTHS,
} from "../lib/pathokReaderPreferences.js";
import "../styles/pathok.css";

function makeDocument(kind) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(), kind, title: "", content: "", createdAt: now, updatedAt: now,
    youtubeUrl: null, youtubeVideoId: null, thumbnailUrl: null, deletedAt: null,
    scrollIndex: 0, scrollOffset: 0, transcriptScrollIndex: 0, transcriptScrollOffset: 0,
    originalTranscript: null, readableTranscript: null, transcriptLanguage: null,
    transcriptStatus: TRANSCRIPT_STATUS.NOT_GENERATED, transcriptError: null,
  };
}

function usePathokLibrary(userId) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const dirtyRef = useRef(false);
  const [remoteConflict, setRemoteConflict] = useState(false);

  async function refresh({ silent = false } = {}) {
    if (!userId) return;
    if (!silent) setLoading(true);
    try {
      const rows = await loadPathokDocuments(userId);
      setDocuments(rows);
      setError("");
    } catch (nextError) {
      setError(nextError.message || "Could not load your Pathok library.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    loadPathokDocuments(userId)
      .then((rows) => { if (active) setDocuments(rows); })
      .catch((nextError) => { if (active) setError(nextError.message || "Could not load your Pathok library."); })
      .finally(() => { if (active) setLoading(false); });
    const unsubscribe = subscribeToPathokDocuments(userId, () => {
      if (dirtyRef.current) setRemoteConflict(true);
      else loadPathokDocuments(userId).then((rows) => { if (active) setDocuments(rows); }).catch(() => {});
    });
    const onFocus = () => {
      if (!dirtyRef.current) loadPathokDocuments(userId).then((rows) => { if (active) setDocuments(rows); }).catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => { active = false; unsubscribe(); window.removeEventListener("focus", onFocus); };
  }, [userId]);

  function mergeDocument(document) {
    setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
    return document;
  }

  async function save(document) {
    const saved = await savePathokDocument(document, userId);
    return mergeDocument(saved);
  }

  async function patch(documentId, fields) {
    const saved = await patchPathokDocument(userId, documentId, fields);
    return mergeDocument(saved);
  }

  async function remove(documentId) {
    const deleted = await softDeletePathokDocument(userId, documentId);
    mergeDocument(deleted);
  }

  function setDirty(value) {
    dirtyRef.current = value;
    if (!value) setRemoteConflict(false);
  }

  return { documents, loading, error, remoteConflict, refresh, save, patch, remove, setDirty };
}

export function PathokPage({ session }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const library = usePathokLibrary(session.user.id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [notice, setNotice] = useState("");
  const isNew = location.pathname === "/pathok/new";
  const isEdit = location.pathname.endsWith("/edit");
  const selected = library.documents.find((document) => document.id === id && !document.deletedAt) || null;
  const filtered = useMemo(
    () => filterPathokDocuments(library.documents, query, filter),
    [library.documents, query, filter],
  );

  async function deleteDocument(document) {
    if (!window.confirm(`Delete “${document.title || "Untitled"}” from your synced library?`)) return;
    await library.remove(document.id);
    if (id === document.id) navigate("/pathok");
  }

  return (
    <div className="pathok-root">
      <header className="pathok-header">
        <div>
          <span className="pathok-eyebrow">YOUR READING SPACE</span>
          <h1>পাঠক</h1>
          <p>YouTube captions, বাংলা notes, one quiet library.</p>
        </div>
        <div className="pathok-header-actions">
          <button className="pathok-ghost-btn" onClick={() => library.refresh()} disabled={library.loading}>Refresh</button>
          <button className="pathok-primary-btn" onClick={() => navigate("/pathok/new")}>＋ Add</button>
        </div>
      </header>

      {(library.error || notice) && (
        <div className={`pathok-alert ${library.error ? "error" : "success"}`} role="status">
          {library.error || notice}
        </div>
      )}
      {library.remoteConflict && (
        <div className="pathok-alert warning" role="alert">
          This item changed on another device. Finish or cancel your edit, then refresh to review it.
        </div>
      )}

      <div className={`pathok-workspace ${id || isNew ? "has-detail" : ""}`}>
        <aside className="pathok-library" aria-label="Pathok library">
          <div className="pathok-library-tools">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your library…" />
            <div className="pathok-pills" aria-label="Filter library">
              {["ALL", PATHOK_KIND.YOUTUBE, PATHOK_KIND.TEXT].map((kind) => (
                <button key={kind} className={filter === kind ? "active" : ""} onClick={() => setFilter(kind)}>
                  {kind === "ALL" ? "All" : kind === PATHOK_KIND.YOUTUBE ? "YouTube" : "Text"}
                </button>
              ))}
            </div>
          </div>
          <div className="pathok-library-list">
            {library.loading ? <LibrarySkeleton /> : filtered.length ? filtered.map((document) => (
              <LibraryCard
                key={document.id}
                document={document}
                active={document.id === id}
                onOpen={() => navigate(`/pathok/document/${document.id}`)}
                onEdit={() => navigate(`/pathok/document/${document.id}/edit`)}
                onDelete={() => deleteDocument(document)}
              />
            )) : <div className="pathok-empty-mini">No saved item matches this view.</div>}
          </div>
        </aside>

        <main className="pathok-detail">
          {(id || isNew) && <button className="pathok-mobile-back" onClick={() => navigate("/pathok")}>← Library</button>}
          {isNew ? (
            <NewDocumentChooser kind={searchParams.get("kind")} navigate={navigate} library={library} onNotice={setNotice} />
          ) : isEdit && selected ? (
            <PathokEditor
              document={selected}
              library={library}
              navigate={navigate}
              onNotice={setNotice}
            />
          ) : selected ? (
            <PathokReader document={selected} onPatch={library.patch} navigate={navigate} onNotice={setNotice} />
          ) : (
            <PathokWelcome navigate={navigate} />
          )}
        </main>
      </div>
    </div>
  );
}

function NewDocumentChooser({ kind, navigate, library, onNotice }) {
  if (kind === "text" || kind === "youtube") {
    return <PathokEditor key={kind} document={makeDocument(kind === "youtube" ? PATHOK_KIND.YOUTUBE : PATHOK_KIND.TEXT)} isNew navigate={navigate} library={library} onNotice={onNotice} />;
  }
  return (
    <section className="pathok-welcome pathok-new-choice">
      <span className="pathok-book-mark">＋</span>
      <h2>What are we saving?</h2>
      <p>Keep a clean note, or turn a captioned YouTube video into a focused reading session.</p>
      <div className="pathok-choice-grid">
        <button onClick={() => navigate("/pathok/new?kind=text")}><strong>Paste text</strong><span>Save বাংলা or English reading notes</span></button>
        <button onClick={() => navigate("/pathok/new?kind=youtube")}><strong>Paste YouTube link</strong><span>Capture captions, thumbnail and title</span></button>
      </div>
    </section>
  );
}

function LibraryCard({ document, active, onOpen, onEdit, onDelete }) {
  const hasBangla = document.content.trim().length > 0;
  const hasEnglish = Boolean(document.originalTranscript);
  return (
    <article className={`pathok-library-card ${active ? "active" : ""}`}>
      <button className="pathok-card-open" onClick={onOpen}>
        {document.kind === PATHOK_KIND.YOUTUBE ? (
          <img src={document.thumbnailUrl || `https://i.ytimg.com/vi/${document.youtubeVideoId}/hqdefault.jpg`} alt="" />
        ) : <span className="pathok-note-glyph">Aa</span>}
        <span className="pathok-card-copy">
          <strong>{document.title || "Untitled"}</strong>
          <small>{document.kind === PATHOK_KIND.YOUTUBE ? `${hasBangla ? "বাংলা ready" : "YouTube transcript"}` : "Text note"}</small>
        </span>
      </button>
      <div className="pathok-card-progress-list">
        {document.kind === PATHOK_KIND.TEXT && <CardProgress label="Read" value={getDocumentProgress(document)} />}
        {document.kind === PATHOK_KIND.YOUTUBE && hasBangla && <CardProgress label="বাংলা" value={getDocumentProgress(document)} />}
        {document.kind === PATHOK_KIND.YOUTUBE && hasEnglish && <CardProgress label="English" value={getDocumentProgress(document, "ENGLISH")} />}
      </div>
      <div className="pathok-card-actions">
        <time>{new Date(document.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
        <button onClick={onEdit} aria-label={`Edit ${document.title}`}>Edit</button>
        <button onClick={onDelete} aria-label={`Delete ${document.title}`}>Delete</button>
      </div>
    </article>
  );
}

function CardProgress({ label, value }) {
  const complete = value >= 100;
  const status = complete ? "Completed" : value > 0 ? `${value}%` : "Not started";
  return <div className="pathok-card-progress"><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><small>{status}</small></div>;
}

function PathokEditor({ document, isNew = false, library, navigate, onNotice = () => {} }) {
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [youtubeUrl, setYoutubeUrl] = useState(document.youtubeUrl || "");
  const [workingDocument, setWorkingDocument] = useState(document);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [format, setFormat] = useState(document.readableTranscript ? "READABLE" : "COMPACT");
  const [manualTranscript, setManualTranscript] = useState(document.readableTranscript || document.originalTranscript || "");
  const [manualTranscriptDirty, setManualTranscriptDirty] = useState(false);
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const isYoutube = document.kind === PATHOK_KIND.YOUTUBE;

  useEffect(() => {
    library?.setDirty(
      title !== document.title
      || content !== document.content
      || youtubeUrl !== (document.youtubeUrl || "")
      || manualTranscriptDirty,
    );
    return () => library?.setDirty(false);
  }, [title, content, youtubeUrl, manualTranscriptDirty, document, library]);

  async function saveText() {
    if (!title.trim() || !content.trim() || !library) return;
    setBusy(true); setError("");
    try {
      const contentChanged = content.trim() !== workingDocument.content;
      const saved = await library.save({
        ...workingDocument,
        title: title.trim(),
        content: content.trim(),
        scrollIndex: contentChanged ? 0 : workingDocument.scrollIndex,
        scrollOffset: contentChanged ? 0 : workingDocument.scrollOffset,
        readingProgressPercent: contentChanged ? null : workingDocument.readingProgressPercent,
        updatedAt: Date.now(),
      });
      library.setDirty(false); onNotice("Saved to your Pathok library."); navigate(`/pathok/document/${saved.id}`);
    } catch (nextError) { setError(nextError.message || "Could not save this note."); }
    finally { setBusy(false); }
  }

  async function loadVideo() {
    if (!parseYouTubeVideoId(youtubeUrl) || !library) { setError("Paste a valid YouTube video link."); return; }
    setBusy(true); setError("");
    try {
      const metadata = await getYouTubeMetadata(youtubeUrl);
      const videoChanged = workingDocument.youtubeVideoId && workingDocument.youtubeVideoId !== metadata.videoId;
      const next = {
        ...workingDocument,
        title: metadata.title,
        youtubeUrl: metadata.canonicalUrl,
        youtubeVideoId: metadata.videoId,
        thumbnailUrl: metadata.thumbnailUrl,
        content: videoChanged ? "" : content,
        originalTranscript: videoChanged ? null : workingDocument.originalTranscript,
        readableTranscript: videoChanged ? null : workingDocument.readableTranscript,
        transcriptStatus: videoChanged ? TRANSCRIPT_STATUS.NOT_GENERATED : workingDocument.transcriptStatus,
        transcriptError: null,
        scrollIndex: videoChanged ? 0 : workingDocument.scrollIndex,
        scrollOffset: videoChanged ? 0 : workingDocument.scrollOffset,
        transcriptScrollIndex: videoChanged ? 0 : workingDocument.transcriptScrollIndex,
        transcriptScrollOffset: videoChanged ? 0 : workingDocument.transcriptScrollOffset,
        readingProgressPercent: videoChanged ? null : workingDocument.readingProgressPercent,
        transcriptProgressPercent: videoChanged ? null : workingDocument.transcriptProgressPercent,
        updatedAt: Date.now(),
      };
      const saved = await library.save(next);
      setWorkingDocument(saved); setTitle(saved.title); setYoutubeUrl(saved.youtubeUrl); setContent(saved.content);
      if (videoChanged) { setManualTranscript(""); setManualTranscriptDirty(false); }
      library.setDirty(false);
      navigate(`/pathok/document/${saved.id}/edit`, { replace: true });
    } catch (nextError) { setError(nextError.message || "Could not load this YouTube video."); }
    finally { setBusy(false); }
  }

  async function requestTranscript(target = workingDocument, forceRefresh = false) {
    if (!library || !target.youtubeUrl) return;
    if (forceRefresh && !window.confirm("Regenerating may use 1 Supadata credit. Continue?")) return;
    setTranscriptBusy(true); setError("");
    try {
      const requested = await library.patch(target.id, { transcript_status: TRANSCRIPT_STATUS.REQUESTED, transcript_error: null, updated_at_ms: Date.now() });
      setWorkingDocument(requested);
      const result = await generatePathokTranscript(target.youtubeUrl, forceRefresh);
      const saved = await library.patch(target.id, {
        original_transcript: result.transcript,
        readable_transcript: result.readableTranscript || null,
        transcript_language: result.language || "und",
        transcript_status: TRANSCRIPT_STATUS.READY,
        transcript_error: null,
        transcript_scroll_index: 0,
        transcript_scroll_offset: 0,
        transcript_progress_percent: null,
        updated_at_ms: Date.now(),
      });
      setWorkingDocument(saved);
      setManualTranscript(saved.readableTranscript || saved.originalTranscript || "");
      setManualTranscriptDirty(false);
      setFormat(saved.readableTranscript ? "READABLE" : "COMPACT");
    } catch (nextError) {
      const message = nextError.message || "Transcript is unavailable.";
      const failed = await library.patch(target.id, { transcript_status: TRANSCRIPT_STATUS.FAILED, transcript_error: message, updated_at_ms: Date.now() }).catch(() => null);
      if (failed) setWorkingDocument(failed);
      setError(message);
    } finally { setTranscriptBusy(false); }
  }

  async function saveManualTranscript() {
    const readable = normalizeReadableTranscript(manualTranscript);
    if (!library || !readable || !workingDocument.id) return;
    setBusy(true); setError("");
    try {
      const saved = await library.patch(workingDocument.id, {
        original_transcript: compactTranscript(readable),
        readable_transcript: readable,
        transcript_language: "en",
        transcript_status: TRANSCRIPT_STATUS.READY,
        transcript_error: null,
        transcript_scroll_index: 0,
        transcript_scroll_offset: 0,
        transcript_progress_percent: null,
        updated_at_ms: Date.now(),
      });
      setWorkingDocument(saved);
      setManualTranscript(saved.readableTranscript || saved.originalTranscript || "");
      setManualTranscriptDirty(false);
      setFormat("READABLE");
      library.setDirty(false);
      onNotice("English transcript saved.");
      navigate(`/pathok/document/${saved.id}`);
    } catch (nextError) { setError(nextError.message || "Could not save the English transcript."); }
    finally { setBusy(false); }
  }

  async function saveBangla() {
    if (!library || !content.trim()) return;
    setBusy(true); setError("");
    try {
      const contentChanged = content.trim() !== workingDocument.content;
      const saved = await library.patch(workingDocument.id, {
        content: content.trim(),
        ...(contentChanged ? { scroll_index: 0, scroll_offset: 0, reading_progress_percent: null } : {}),
        updated_at_ms: Date.now(),
      });
      library.setDirty(false); onNotice("বাংলা text saved."); navigate(`/pathok/document/${saved.id}`);
    } catch (nextError) { setError(nextError.message || "Could not save বাংলা text."); }
    finally { setBusy(false); }
  }

  if (!library) return null;
  const transcript = format === "READABLE" ? workingDocument.readableTranscript : workingDocument.originalTranscript;
  return (
    <section className="pathok-editor">
      <div className="pathok-section-heading">
        <span>{isYoutube ? "YOUTUBE READING" : "TEXT NOTE"}</span>
        <h2>{isNew ? (isYoutube ? "Paste a YouTube link" : "Create a reading note") : `Edit ${isYoutube ? "YouTube item" : "note"}`}</h2>
      </div>
      {error && error !== workingDocument.transcriptError && <div className="pathok-alert error" role="alert">{error}</div>}
      {!isYoutube ? (
        <div className="pathok-form-stack">
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A clear title" /></label>
          <label>Reading text<textarea value={content} onChange={(event) => setContent(event.target.value)} rows="18" placeholder="Paste বাংলা or English text…" /></label>
          <div className="pathok-form-actions"><button className="pathok-ghost-btn" onClick={() => navigate(-1)}>Cancel</button><button className="pathok-primary-btn" disabled={busy || !title.trim() || !content.trim()} onClick={saveText}>{busy ? "Saving…" : "Save note"}</button></div>
        </div>
      ) : (
        <div className="pathok-form-stack">
          <label>YouTube link<div className="pathok-inline-field"><input value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://youtu.be/…" /><button disabled={busy || !parseYouTubeVideoId(youtubeUrl)} onClick={loadVideo}>{busy ? "Loading…" : "Load video"}</button></div></label>
          {workingDocument.youtubeVideoId && (
            <>
              <div className="pathok-video-preview"><img src={workingDocument.thumbnailUrl} alt="" /><div><span>YOUTUBE VIDEO</span><h3>{workingDocument.title}</h3><a href={workingDocument.youtubeUrl} target="_blank" rel="noreferrer">Open video ↗</a></div></div>
              <div className="pathok-form-actions">
                <button
                  className="pathok-primary-btn"
                  disabled={transcriptBusy}
                  onClick={() => requestTranscript(workingDocument, Boolean(workingDocument.originalTranscript))}
                >
                  {transcriptBusy
                    ? "Generating…"
                    : workingDocument.originalTranscript ? "Regenerate transcript" : workingDocument.transcriptStatus === TRANSCRIPT_STATUS.FAILED ? "Retry transcript" : "Generate transcript"}
                </button>
                <span className="pathok-action-note">Generation starts only when you click the button.</span>
              </div>
              {workingDocument.transcriptStatus === TRANSCRIPT_STATUS.REQUESTED && <div className="pathok-transcript-loading"><i /><span>Generating timestamp-free captions…</span></div>}
              {workingDocument.transcriptStatus === TRANSCRIPT_STATUS.FAILED && workingDocument.transcriptError && <div className="pathok-alert error" role="alert">{workingDocument.transcriptError}</div>}
              <label>English transcript<textarea value={manualTranscript} onChange={(event) => { setManualTranscript(event.target.value); setManualTranscriptDirty(true); }} rows="14" placeholder="Paste an English transcript here, or generate one above…" /></label>
              {workingDocument.originalTranscript && !manualTranscriptDirty && (
                <div className="pathok-transcript-box">
                  <div className="pathok-panel-title"><h3>Saved transcript</h3><FormatToggle format={format} setFormat={setFormat} readable={Boolean(workingDocument.readableTranscript)} /></div>
                  <div className="pathok-transcript-preview">{transcript}</div>
                  <div className="pathok-form-actions"><CopyButton text={transcript} /></div>
                </div>
              )}
              <div className="pathok-form-actions"><button className="pathok-primary-btn" disabled={busy || transcriptBusy || !manualTranscript.trim()} onClick={saveManualTranscript}>{busy ? "Saving…" : "Save English transcript"}</button></div>
              <label>বাংলা text<textarea value={content} onChange={(event) => setContent(event.target.value)} rows="12" placeholder="বাংলা অনুবাদ এখানে পেস্ট করুন…" /></label>
              <div className="pathok-form-actions"><button className="pathok-ghost-btn" onClick={() => navigate(`/pathok/document/${workingDocument.id}`)}>Cancel</button><button className="pathok-primary-btn" disabled={busy || !content.trim()} onClick={saveBangla}>{busy ? "Saving…" : "Save বাংলা text"}</button></div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function PathokReader({ document, onPatch, navigate, onNotice }) {
  const [language, setLanguage] = useState(document.content.trim() ? "BANGLA" : "ENGLISH");
  const [format, setFormat] = useState(document.readableTranscript ? "READABLE" : "COMPACT");
  const [preferences, setPreferences] = useState(() => parseReaderPreferences(localStorage.getItem("pathok.reader.preferences")));
  const [focusMode, setFocusMode] = useState(false);
  const [focusSnapshot, setFocusSnapshot] = useState(null);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [progress, setProgress] = useState(0);
  const [readerStatus, setReaderStatus] = useState("");
  const readerRef = useRef(null);
  const scrollRef = useRef(null);
  const timerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const activeDocument = focusMode && focusSnapshot ? focusSnapshot : document;
  const english = format === "READABLE" && activeDocument.readableTranscript ? activeDocument.readableTranscript : activeDocument.originalTranscript || "";
  const readingText = language === "BANGLA" ? activeDocument.content : english;
  const paragraphs = useMemo(() => splitReadingText(readingText), [readingText]);
  const activeFontSize = language === "BANGLA" ? preferences.banglaFontSize : preferences.englishFontSize;
  const deferredContent = focusMode && focusSnapshot && (
    document.title !== focusSnapshot.title ||
    document.content !== focusSnapshot.content ||
    document.originalTranscript !== focusSnapshot.originalTranscript ||
    document.readableTranscript !== focusSnapshot.readableTranscript
  );

  function persistPreferences(next) {
    setPreferences(next);
    localStorage.setItem("pathok.reader.preferences", JSON.stringify(next));
  }

  function revealToolbar() {
    if (!focusMode) return;
    setToolbarVisible(true);
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setToolbarVisible(false), 3000);
  }

  useEffect(() => {
    const container = scrollRef.current;
    const index = language === "BANGLA" ? activeDocument.scrollIndex : activeDocument.transcriptScrollIndex;
    const offset = language === "BANGLA" ? activeDocument.scrollOffset : activeDocument.transcriptScrollOffset;
    const target = container?.querySelector(`[data-paragraph="${index}"]`);
    if (container && target) container.scrollTop = target.offsetTop - container.offsetTop + offset;
    if (container) window.requestAnimationFrame(() => {
      const maximum = Math.max(1, container.scrollHeight - container.clientHeight);
      setProgress(Math.min(100, Math.max(0, (container.scrollTop / maximum) * 100)));
    });
    // Progress updates must not retrigger restoration while the user is scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocument.id, language, format, focusMode]);

  function saveProgress() {
    const container = scrollRef.current;
    if (!container) return;
    const blocks = [...container.querySelectorAll("[data-paragraph]")];
    const first = blocks.find((block) => block.offsetTop + block.offsetHeight > container.scrollTop + container.offsetTop) || blocks.at(-1);
    if (!first) return;
    const index = Number(first.dataset.paragraph);
    const offset = Math.max(0, container.scrollTop + container.offsetTop - first.offsetTop);
    const maximum = Math.max(1, container.scrollHeight - container.clientHeight);
    const rawProgress = Math.min(100, Math.max(0, (container.scrollTop / maximum) * 100));
    const percentage = rawProgress >= 98 || container.scrollTop >= maximum - 2 ? 100 : Math.round(rawProgress);
    const fields = language === "BANGLA"
      ? { scroll_index: index, scroll_offset: offset, reading_progress_percent: percentage }
      : { transcript_scroll_index: index, transcript_scroll_offset: offset, transcript_progress_percent: percentage };
    onPatch(activeDocument.id, { ...fields, updated_at_ms: Date.now() }).catch(() => {});
  }

  function onScroll() {
    const container = scrollRef.current;
    if (container) {
      const maximum = Math.max(1, container.scrollHeight - container.clientHeight);
      setProgress(Math.min(100, Math.max(0, (container.scrollTop / maximum) * 100)));
    }
    if (focusMode) setToolbarVisible(false);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(saveProgress, 700);
  }

  function changeLanguage(next) {
    saveProgress();
    setLanguage(next);
    revealToolbar();
  }

  function changeFormat(next) {
    saveProgress();
    setFormat(next);
    revealToolbar();
  }

  async function enterFocus() {
    setFocusSnapshot({ ...document });
    setFocusMode(true);
    setToolbarVisible(true);
    setReaderStatus("");
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setToolbarVisible(false), 3000);
    if (typeof readerRef.current?.requestFullscreen !== "function") {
      setReaderStatus("Browser fullscreen is unavailable. App focus mode is still active.");
      return;
    }
    try {
      await readerRef.current.requestFullscreen();
    } catch {
      setReaderStatus("Browser fullscreen was unavailable. App focus mode is still active.");
    }
  }

  async function exitFocus() {
    saveProgress();
    window.clearTimeout(hideTimerRef.current);
    if (globalThis.document.fullscreenElement === readerRef.current) await globalThis.document.exitFullscreen().catch(() => {});
    setFocusMode(false);
    setFocusSnapshot(null);
    setToolbarVisible(true);
    if (deferredContent) setReaderStatus("Latest changes from your library are now visible.");
  }

  useEffect(() => {
    const onFullscreenChange = () => {
      if (focusMode && !globalThis.document.fullscreenElement) {
        saveProgress();
        setFocusMode(false);
        setFocusSnapshot(null);
        setToolbarVisible(true);
      }
    };
    globalThis.document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => globalThis.document.removeEventListener("fullscreenchange", onFullscreenChange);
  });

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (key === "f") { event.preventDefault(); focusMode ? exitFocus() : enterFocus(); }
      else if (key === "escape" && focusMode) exitFocus();
      else if (key === "b" && activeDocument.content.trim()) changeLanguage("BANGLA");
      else if (key === "e" && activeDocument.originalTranscript) changeLanguage("ENGLISH");
      else if (key === "r" && activeDocument.readableTranscript) changeFormat("READABLE");
      else if (key === "c" && activeDocument.originalTranscript) changeFormat("COMPACT");
      else if (key === "+" || key === "=") persistPreferences(changeReaderFontSize(preferences, language, 1));
      else if (key === "-") persistPreferences(changeReaderFontSize(preferences, language, -1));
      if (focusMode) revealToolbar();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const flush = () => saveProgress();
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    const onVisibilityChange = () => { if (globalThis.document.visibilityState === "hidden") flush(); };
    globalThis.document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      globalThis.document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearTimeout(timerRef.current);
      window.clearTimeout(hideTimerRef.current);
    };
  });

  async function copyText() {
    await navigator.clipboard.writeText(readingText);
    const message = `${language === "BANGLA" ? "বাংলা text" : "Transcript"} copied.`;
    setReaderStatus(message);
    if (!focusMode) onNotice(message);
  }

  return (
    <section
      ref={readerRef}
      className={`pathok-reader pathok-theme-${preferences.theme.toLowerCase()} ${focusMode ? "pathok-focus-mode" : ""}`}
      style={{ "--reader-width": `${READER_WIDTHS[preferences.width]}px`, "--reader-font-size": `${activeFontSize}px` }}
      onPointerMove={revealToolbar}
      onPointerDown={revealToolbar}
    >
      {focusMode && (
        <div className={`pathok-focus-toolbar ${toolbarVisible ? "visible" : ""}`} aria-hidden={!toolbarVisible} inert={!toolbarVisible}>
          <div className="pathok-focus-title"><span>FOCUS READING</span><strong>{activeDocument.title}</strong></div>
          <div className="pathok-focus-tools">
            {activeDocument.kind === PATHOK_KIND.YOUTUBE && <LanguageToggle language={language} changeLanguage={changeLanguage} document={activeDocument} />}
            {language === "ENGLISH" && <FormatToggle format={format} setFormat={changeFormat} readable={Boolean(activeDocument.readableTranscript)} />}
            <div className="pathok-focus-group" aria-label="Font size">
              <button onClick={() => persistPreferences(changeReaderFontSize(preferences, language, -1))} disabled={activeFontSize <= 16} aria-label="Decrease font size">A−</button>
              <span>{activeFontSize}px</span>
              <button onClick={() => persistPreferences(changeReaderFontSize(preferences, language, 1))} disabled={activeFontSize >= 30} aria-label="Increase font size">A+</button>
            </div>
            <select aria-label="Reading width" value={preferences.width} onChange={(event) => persistPreferences({ ...preferences, width: event.target.value })}>
              <option value="NARROW">Narrow</option><option value="COMFORTABLE">Comfortable</option><option value="WIDE">Wide</option>
            </select>
            <select aria-label="Reading theme" value={preferences.theme} onChange={(event) => persistPreferences({ ...preferences, theme: event.target.value })}>
              <option value="PAPER">Paper</option><option value="WHITE">White</option><option value="NIGHT">Night</option>
            </select>
            <button className="pathok-focus-exit" onClick={exitFocus}>Exit focus</button>
          </div>
        </div>
      )}
      <div className="pathok-reader-top pathok-normal-reader-ui">
        <div><span>{activeDocument.kind === PATHOK_KIND.YOUTUBE ? "YOUTUBE READING" : "SAVED NOTE"}</span><h2>{activeDocument.title}</h2></div>
        <div className="pathok-reader-actions"><button className="pathok-primary-btn" onClick={enterFocus}>Focus mode</button><button className="pathok-ghost-btn" onClick={copyText}>Copy</button><button className="pathok-ghost-btn" onClick={() => navigate(`/pathok/document/${activeDocument.id}/edit`)}>Edit</button></div>
      </div>
      {activeDocument.kind === PATHOK_KIND.YOUTUBE && (
        <div className="pathok-reader-controls pathok-normal-reader-ui">
          <LanguageToggle language={language} changeLanguage={changeLanguage} document={activeDocument} />
          {language === "ENGLISH" && <FormatToggle format={format} setFormat={changeFormat} readable={Boolean(activeDocument.readableTranscript)} />}
          <a href={activeDocument.youtubeUrl} target="_blank" rel="noreferrer">Watch video ↗</a>
        </div>
      )}
      {readingText ? (
        <div className="pathok-reading-scroll" ref={scrollRef} onScroll={onScroll} onClick={revealToolbar}>
          <article lang={language === "BANGLA" ? "bn" : "en"}>{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`} data-paragraph={index}>{paragraph}</p>)}</article>
        </div>
      ) : <div className="pathok-empty-reader"><h3>No reading text yet</h3><p>Edit this item to add বাংলা text or generate its transcript.</p></div>}
      {focusMode && <div className="pathok-focus-progress" aria-label={`${Math.round(progress)} percent read`}><i style={{ width: `${progress}%` }} /><span>{Math.round(progress)}%</span></div>}
      {(readerStatus || deferredContent) && <div className="pathok-reader-status" role="status">{deferredContent ? "Library updates will appear after focus mode." : readerStatus}</div>}
    </section>
  );
}

function LanguageToggle({ language, changeLanguage, document }) {
  return <div className="pathok-pills" aria-label="Reading language"><button aria-pressed={language === "BANGLA"} className={language === "BANGLA" ? "active" : ""} disabled={!document.content.trim()} onClick={() => changeLanguage("BANGLA")}>বাংলা</button><button aria-pressed={language === "ENGLISH"} className={language === "ENGLISH" ? "active" : ""} disabled={!document.originalTranscript} onClick={() => changeLanguage("ENGLISH")}>English</button></div>;
}

function FormatToggle({ format, setFormat, readable }) {
  return <div className="pathok-pills compact" aria-label="Transcript format"><button aria-pressed={format === "READABLE"} className={format === "READABLE" ? "active" : ""} disabled={!readable} onClick={() => setFormat("READABLE")}>Readable</button><button aria-pressed={format === "COMPACT"} className={format === "COMPACT" ? "active" : ""} onClick={() => setFormat("COMPACT")}>Compact</button></div>;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(text || ""); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
  return <button className="pathok-primary-btn" disabled={!text} onClick={copy}>{copied ? "Copied" : "Copy transcript"}</button>;
}

function PathokWelcome({ navigate }) {
  return <section className="pathok-welcome"><span className="pathok-book-mark">◉</span><h2>Your quiet reading desk</h2><p>Select something from your library, or bring in a text note or captioned YouTube video.</p><button className="pathok-primary-btn" onClick={() => navigate("/pathok/new")}>Add your first item</button></section>;
}

function LibrarySkeleton() {
  return <>{[1, 2, 3].map((item) => <div className="pathok-skeleton" key={item}><i /><span /></div>)}</>;
}
