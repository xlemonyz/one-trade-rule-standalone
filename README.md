# One Trade Rule (Standalone)

Standalone One Trade Rule app (fully separate from OneTrade OS).

## Isolation Promise

This project is intentionally isolated:

- Separate folder/repo
- Separate Supabase project
- Separate auth users
- Separate MT5 API keys + connection
- Separate Vercel project/domain

OneTrade OS code and DB are not used by runtime.

## Tech Stack

- React + Vite
- Supabase Auth + Postgres
- Supabase Edge Function: `mt5-import`

## Routes

- `/one-trade-rule`
- `/trading-journal`
- `/mt5-sync`
- `/settings`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file from sample:

```bash
copy .env.example .env
```

3. Fill `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

4. Start dev server:

```bash
npm run dev
```

5. Build test:

```bash
npm run build
```

## Supabase Setup (New Project)

1. Run SQL migration:

- `supabase/migrations/20260520_000001_init.sql`

2. Deploy edge function:

```bash
supabase functions deploy mt5-import
```

3. Set edge function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

4. Update MT5 EA WebRequest URL:

```text
https://<your-project-ref>.functions.supabase.co/mt5-import
```

## MT5 Core Behavior

- Stable `trading_day_key` mapping for challenge day
- Challenge start-time gate blocks old tickets
- Duplicate guard by broker ticket/signature
- Day-close logic idempotent (safe on repeated runs)
- Status rules:
  - `0 trades` => `No Trade Day`
  - `1 valid trade` => `Clean Trade Day`
  - `2+ trades` => `Broken Day`

## Deployment

1. Push this folder to its own GitHub repo
2. Import repo in Vercel as a new project
3. Add env vars in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## Roadmap

Detailed phased roadmap:

- `docs/ROADMAP.md`
