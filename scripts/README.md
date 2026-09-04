# War Room · Applicant sync scripts

## What's here

- **`blacklist_guard.mjs`** — reusable module. Loads the "no-rehire" list from
  the Google Sheet + Monday's OFFBOARDED + BLACKLISTED groups. Exposes
  `loadGuard()` → returns a `check({ email, phone, telegram, name })` function
  that returns a match record (or null).
- **`sync_applicants.mjs`** — canonical script that pulls the Meta ad leads
  sheet, dedupes, runs each candidate through the blacklist guard, and pushes
  to the right group on Monday. Hits land in `OFFBOARDED` with a
  `BLACKLIST HIT` source tag — never in `APPLICANTS`.

## Running

```
# Dry run — shows what would happen, no writes
node --env-file=.env.local scripts/sync_applicants.mjs --dry

# Real push
node --env-file=.env.local scripts/sync_applicants.mjs
```

Both commands read env from `.env.local`:
- `MONDAY_API_TOKEN`
- `MONDAY_BOARD_ID_PH`

## When to use

Anytime the user asks "check the sheet for new applicants". This script:
- Only creates rows that are actually new (dedupes by email + name across
  APPLICANTS Exp, APPLICANTS Non Exp, and PENDING CHAT TRIAL)
- Auto-blocks anyone previously fired / offboarded / blacklisted
- Populates all columns (name, email, telegram, discord, phone, country, source)
- Posts the full Q&A as an Update on each row
- Handles the Inexperienced-tab column-shift bug automatically

## When NOT to use

For individual add requests (e.g. "add Milos Lukic to PENDING DAY 1"), keep
using ad-hoc scripts — but import `blacklist_guard.mjs` and call
`guard.check()` before creating. That's the guarantee going forward.

## Extending to other lead sources

If a new sheet or Typeform arrives, wrap the flow: fetch → normalise fields →
call `guard.check()` per candidate → push. The guard doesn't care where the
candidate came from.
