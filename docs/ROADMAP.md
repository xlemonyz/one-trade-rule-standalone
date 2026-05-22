# One Trade Rule Standalone Roadmap

## Phase 1: Bootstrap (Day 1-2)

- New isolated workspace/repo
- New Supabase project + env wiring
- Auth gate + route skeleton

## Phase 2: Core Engine (Day 3-5)

- Challenge lifecycle model
- Stable canonical day mapping (`trading_day_key`)
- Attach gate:
  - Challenge start-time filter
  - Challenge isolation
  - Duplicate ticket protection

## Phase 3: MT5 + Close Flow (Day 6-8)

- MT5 sync connection UI
- MT5 import pipeline
- Production day-close engine
- Live trades + day details

## Phase 4: Hardening (Day 9-11)

- Midnight and gold-close scenario checks
- Reload/relogin stability checks
- Idempotency checks
- RLS/permissions validation

## Phase 5: Release (Day 12)

- Vercel production deploy
- Smoke test with 2-3 clean test users
- Release checklist + rollback notes

## Production Rules

- `trading_day_key` is canonical challenge day
- MT5 broker `date/time` is metadata only
- Same broker ticket must not duplicate
- Old tickets before challenge start are blocked
- Close must be idempotent

