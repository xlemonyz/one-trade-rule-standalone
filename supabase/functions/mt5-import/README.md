# `mt5-import` Edge Function

This function receives MT5 EA trade payloads and imports closed trades into challenge-only storage.
If no active challenge exists for the user, import is rejected.

## Required secrets

Set these in Supabase project settings (or `supabase secrets set`):

- `APP_SUPABASE_URL`
- `APP_SUPABASE_SERVICE_ROLE_KEY`

## Deploy

```bash
supabase functions deploy mt5-import
```

## Function URL

```text
https://<project-ref>.functions.supabase.co/mt5-import
```

## Payload example

```json
{
  "apiKey": "mt5_xxx",
  "accountNumber": "1234567",
  "ticket": "987654321",
  "symbol": "XAUUSD",
  "direction": "BUY",
  "openTime": "2026-04-28T10:00:00Z",
  "closeTime": "2026-04-28T10:15:00Z",
  "entryPrice": 3320.1,
  "closePrice": 3322.5,
  "lotSize": 0.1,
  "profit": 24.0,
  "commission": -1.2,
  "swap": 0,
  "comment": "EA close"
}
```

Expected response:

- `{ "ok": true, "status": "inserted" }`
- `{ "ok": true, "status": "duplicate" }`
- `{ "ok": false, "code": "NO_ACTIVE_CHALLENGE", "error": "..." }`
