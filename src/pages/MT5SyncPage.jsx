import { useEffect, useMemo, useState } from "react";

function maskKey(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 8) return `${raw.slice(0, 2)}••••`;
  return `${raw.slice(0, 6)}••••••${raw.slice(-4)}`;
}

export function MT5SyncPage({ connection, onSaveConnection, onRefresh, syncing }) {
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    broker_name: "",
    account_number: "",
    api_key: "",
    endpoint_url: "",
  });

  function createApiKey() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `mt5_${token}`;
  }

  useEffect(() => {
    setForm({
      broker_name: String(connection?.broker_name || ""),
      account_number: String(connection?.account_number || ""),
      api_key: String(connection?.api_key || ""),
      endpoint_url: String(connection?.endpoint_url || ""),
    });
  }, [connection?.id, connection?.updated_at]);

  const masked = useMemo(() => maskKey(form.api_key), [form.api_key]);

  async function handleSave(event) {
    event.preventDefault();
    setNotice("");
    await onSaveConnection({
      ...form,
      api_key_masked: maskKey(form.api_key),
    });
  }

  async function copyApiKey() {
    if (!form.api_key) {
      setNotice("Generate or enter an API key first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(form.api_key);
      setNotice("API key copied.");
    } catch {
      setNotice("Could not copy automatically. Copy it manually from the field.");
    }
  }

  return (
    <div className="row" style={{ gap: 16 }}>
      <section className="page-card row">
        <h1 className="section-title">MT5 Sync</h1>
        <p className="section-subtitle">
          Connect MT5 API key and account here for this standalone One Trade Rule project.
        </p>
        <div className="split">
          <div className="stat">
            <div className="label">Status</div>
            <div className="value" style={{ fontSize: 22 }}>
              {connection?.api_key ? "Configured" : "Not Configured"}
            </div>
          </div>
          <div className="stat">
            <div className="label">Last Sync</div>
            <div className="value" style={{ fontSize: 22 }}>
              {connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "--"}
            </div>
          </div>
        </div>
      </section>

      <section className="page-card">
        <form className="row" onSubmit={handleSave}>
          <div className="form-group">
            <label>Broker / Server</label>
            <input
              value={form.broker_name}
              onChange={(e) => setForm((prev) => ({ ...prev, broker_name: e.target.value }))}
              placeholder="e.g. FTMO Global Markets"
            />
          </div>
          <div className="form-group">
            <label>MT5 Account Number</label>
            <input
              value={form.account_number}
              onChange={(e) => setForm((prev) => ({ ...prev, account_number: e.target.value }))}
              placeholder="e.g. 12345678"
            />
          </div>
          <div className="form-group">
            <label>API Key</label>
            <input
              value={form.api_key}
              onChange={(e) => setForm((prev) => ({ ...prev, api_key: e.target.value }))}
              placeholder="mt5_xxxx..."
            />
          </div>
          <div className="form-group">
            <label>Importer Endpoint (optional)</label>
            <input
              value={form.endpoint_url}
              onChange={(e) => setForm((prev) => ({ ...prev, endpoint_url: e.target.value }))}
              placeholder="https://<project>.functions.supabase.co/mt5-import"
            />
          </div>
          <div className="meta">Masked key preview: {masked || "--"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                const key = createApiKey();
                setForm((prev) => ({ ...prev, api_key: key }));
                setNotice("New API key generated.");
              }}
            >
              Generate API Key
            </button>
            <button type="button" className="secondary-btn" onClick={copyApiKey}>
              Copy API Key
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                const key = createApiKey();
                setForm((prev) => ({ ...prev, api_key: key }));
                setNotice("API key regenerated.");
              }}
            >
              Regenerate
            </button>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit">Save Connection</button>
            <button type="button" className="secondary-btn" onClick={onRefresh} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          </div>
          {notice ? <div className="meta">{notice}</div> : null}
        </form>
      </section>
    </div>
  );
}
