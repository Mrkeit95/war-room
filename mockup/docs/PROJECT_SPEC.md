# The War Room — Project Spec

> Paste this file into your repo as `PROJECT_SPEC.md`. Reference it in Continue/Claude prompts. This is the single source of truth for what we're building.

**Project name:** The War Room
**Purpose:** Single-operator command center for chatter recruiting + training across 4 regional pipelines.

---

## 1. Overview

A single-user, read-only web dashboard that sits on top of Monday.com and surfaces what needs the operator's attention across a chatter recruiting + training operation. Managers continue working in Monday as normal — they never touch this app.

**Primary user:** the operator (me). No other user accounts needed for v1.

**Core principle:** the dashboard should *tell me what to look at*, not just display data. If I open it and everything is green, I close it. If something is wrong, it's the first thing I see.

---

## 2. Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Supabase (Postgres) — for caching Monday data + computing historicals
- **Auth:** Supabase Auth (single user, email magic link is fine)
- **Hosting:** Vercel
- **Source control:** GitHub
- **Data source:** Monday.com GraphQL API v2
- **Future:** Infloww API (beta) for post-hire chatter performance — not v1

---

## 3. The Operation Being Tracked

### 3.1 Four regional pipelines

| Region | Manager(s) | Structure |
|---|---|---|
| Philippines (PH) | Apple, Darla, Pauline | Specialists — recruit only, hand off to dedicated training teams |
| Europe | Aleksandar | Vertical — owns recruiting + training |
| South America | Sebastien | Vertical — owns recruiting + training |
| UK | Noah | Vertical — owns recruiting + training |

### 3.2 Universal pipeline shape

Every region, every track:

```
Typeform → Interview → Training → Active (handed off to company ops, exits this dashboard)
```

The interview step is universal — nobody skips it, experienced or not.

### 3.3 Training varies by region

**Philippines — Experienced track:**
- Training Board (1 week, proving ground)
- Run by 2 dedicated managers across 2 shifts (not separate batches — shift coverage)

**Philippines — Non-Experienced track (batched parallel lanes):**
- Week 1 Training → Week 2 Training → Week 3 Training (Week 3 not yet operational)
- Week 1: 2 managers, each running their own batch
- Week 2: 2 managers, each running their own batch
- **Lanes are paired:** Week 1 Manager A → hands off to Week 2 Manager A; same for B
- This pairing means we can attribute downstream performance cleanly back to training lane

**Europe / SA / UK:**
- The regional manager runs both Exp + Non-Exp tracks themselves
- Typically Week 1 + Week 2 training (no separate training board)

### 3.4 Strategic context

- PH is currently the workhorse but the operator wants to shift mix to ~25% PH, ~75% other regions over time
- The dashboard should make this shift *visible* (source mix vs. target)

---

## 4. The Three Layers of the Dashboard

The UI is organized into three layers, top to bottom:

### Layer 1: Attention Feed (top of page)

The first thing visible. A live list of things needing attention right now. Each item is an actionable card that says what's wrong and (where possible) which manager owns it.

**Categories of alerts:**

1. **Candidate-level** — individual person stuck too long for their stage
2. **Pipeline-level** — not enough flow (low Typeform volume, empty stages, bottlenecks)
3. **Manager-level** — no activity, conversion rate dropping vs. their baseline, slow updates

**Stage-specific thresholds** (configurable, these are starting defaults):

| Stage | Alert if no movement for |
|---|---|
| Typeform → Passed Typeform | 3 days |
| Passed Typeform → Pending Interview | 2 days |
| Pending Interview → Scheduled | 2 days |
| Scheduled Interview → Onboarding | 2 days after scheduled date |
| Onboarding → Training | 2 days |
| Week 1 Training | 8 days (training is 7) |
| Week 2 Training | 8 days |
| Training Board | 8 days |

**Pipeline alerts:**
- Region has < N new Typeforms in last 7 days (configurable per region)
- Stage has > N candidates piling up (bottleneck signal)
- Whole region has had no stage transitions in 48 hours

**Manager alerts:**
- Manager's 7-day conversion rate is X% below their 30-day baseline
- Manager hasn't logged any board activity in 24 hours
- Manager's batch has unusually high drop-off vs. paired lane

### Layer 2: Regional Pipelines

Four pipeline views (PH, EU, SA, UK), each showing the funnel as a column-based visual:

```
Typeform → Passed → Pending Interview → Scheduled → [Training Stages] → Active
```

- Counts at each stage
- Drill down: click a stage to see the candidates in it, with days-in-stage
- For PH non-exp: show Lane A vs. Lane B side-by-side so they're directly comparable
- Conversion rate between each stage
- Trend arrows (vs. last week)

### Layer 3: Manager Performance

A scorecard per manager. Because roles differ, **scorecards differ:**

**For recruiters (Apple, Darla, Pauline) — judged on:**
- Typeform volume in (their share)
- Typeform → Interview pass rate
- Interview → Training pass rate
- Speed: avg days Typeform → Training

**For vertical managers (Aleksandar, Sebastien, Noah) — judged on:**
- Full funnel: Typeform → Active conversion rate
- Volume in
- Speed end-to-end
- Activity (board update frequency)

**For training managers (PH Week 1, Week 2, Training Board) — judged on:**
- Pass-through rate (% of batch that reaches next stage)
- For paired lanes: comparison against paired counterpart
- Speed (any batch sitting too long?)

**Composite "manager health score"** — single number 0-100 combining the above relative to each manager's role. Color-coded. Click to expand into the underlying metrics.

---

## 5. Data Layer

### 5.1 Monday.com sync

- Monday is the source of truth. Managers work there. The dashboard never writes back.
- Pull Monday data on a schedule (every 15 min via a Vercel cron + Supabase Edge Function) and cache in Postgres.
- Track all stage transitions over time (Monday's API gives us the current state; we record snapshots so we can compute trends, velocities, and history).
- Boards to sync:
  - `CHATTER DATABASE` (Filipino main)
  - `CHATTER DATABASE (SOUTH AMERICA)`
  - `CHATTER DATABASE (EUROPEANS)`
  - `CHATTER DATABASE (UK)`

### 5.2 Database schema (Supabase / Postgres)

Approximate tables:

```sql
-- Each candidate, one row per person
candidates (
  id uuid primary key,
  monday_item_id text unique,
  monday_board_id text,
  region text,            -- 'PH' | 'EU' | 'SA' | 'UK'
  name text,
  current_stage text,     -- normalized stage name
  current_status text,
  tier text,
  track text,             -- 'exp' | 'non_exp'
  assigned_manager text,
  telegram text,
  phone text,
  country text,
  picture_url text,
  first_seen_at timestamptz,
  last_updated_at timestamptz,
  raw_data jsonb          -- full Monday item for debugging
);

-- Every stage change, for computing velocities
stage_transitions (
  id uuid primary key,
  candidate_id uuid references candidates(id),
  from_stage text,
  to_stage text,
  changed_at timestamptz,
  detected_at timestamptz
);

-- Daily snapshots for trend analysis
pipeline_snapshots (
  id uuid primary key,
  snapshot_date date,
  region text,
  stage text,
  candidate_count int,
  created_at timestamptz
);

-- Manager metadata
managers (
  id uuid primary key,
  name text,
  role text,              -- 'recruiter' | 'vertical' | 'trainer'
  region text,
  training_stage text,    -- if trainer: 'week_1' | 'week_2' | 'training_board'
  lane text               -- for paired lanes: 'A' | 'B' | null
);

-- Alert configuration (thresholds per stage, per region, etc.)
alert_config (
  id uuid primary key,
  alert_type text,
  scope text,             -- 'stage' | 'region' | 'manager'
  scope_value text,
  threshold_value numeric,
  threshold_unit text,    -- 'days' | 'count' | 'percent'
  enabled boolean
);

-- Generated alerts (current + dismissed)
alerts (
  id uuid primary key,
  alert_type text,
  severity text,          -- 'info' | 'warning' | 'critical'
  title text,
  description text,
  related_candidate_id uuid,
  related_manager text,
  related_region text,
  created_at timestamptz,
  dismissed_at timestamptz,
  acknowledged_at timestamptz
);
```

### 5.3 Stage normalization

Monday boards use slightly different group names per region. The sync layer needs to **normalize** these to a canonical set. Example mapping (extend as needed):

| Monday group label | Canonical stage |
|---|---|
| `TYPEFORM`, `TYPEFORMS` | `typeform` |
| `PASSED- TYPEFORMS`, `PASSED TYPEFORM` | `passed_typeform` |
| `PENDING- INTERVIEWS`, `PENDING INTERVIEWS` | `pending_interview` |
| `SCHEDULED INTERVIEWS`, `SCHEDULED- INTERVIEWS` | `scheduled_interview` |
| `PENDING - DISCORD ONBOARDING`, `PENDING- DISCORD ONBOARDING` | `pending_onboarding` |
| `WEEK 1 TRAINING`, `WEEK 1- TRAINING`, `WEEK 1- TRAINING (Non Exp)` | `week_1_training` |
| `WEEK 1- TRAINING (EXP)` | `training_board` (treated as exp track) |
| `WEEK 2 TRAINING SHADOW+LIVE CHA`, `WEEK 2- TRAINING` | `week_2_training` |
| `WEEK 3-4 EXTRA CHATTING` | `week_3_training` |
| `TRAINING BOARD CHATTERS`, `TB PROBATION (EXP)`, `PENDING TB PROBATION (EXP)` | `training_board` |
| `STANDBY`, `STANDBY (EXP)`, `STANDBY (FROM TB)` | `standby` |
| `ACTIVE` | `active` (exit point) |
| `POOL (AFTER WEEK 2)` | `pool` |
| `PROMOTED` | `promoted` |
| `PERSONAL TIME OFF` | `pto` |
| `OFFBOARDED`, `TRANSFERRED TO ALEKSANDAR (EXP)` | `offboarded` |

Keep the original Monday group name in `raw_data` for reference.

---

## 6. Build Order (Phased)

### Phase 1 — Foundation (week 1)
- Next.js + Supabase + Tailwind + shadcn scaffolded
- Supabase Auth working (just for you)
- Monday API connection (get API token, fetch one board, log the response)
- Database schema deployed in Supabase
- Basic layout shell with empty Layer 1 / 2 / 3 sections

### Phase 2 — Data sync (week 2)
- Build the sync job: fetch all 4 boards, normalize stages, upsert into `candidates`, log `stage_transitions`
- Run on a cron every 15 minutes via Vercel
- Daily snapshot job (midnight UTC) for trend analysis
- Manual "Sync now" button for testing

### Phase 3 — Regional pipelines (Layer 2) (week 3)
- Render 4 pipeline views with stage counts
- Drill-down: click a stage to see candidates inside
- PH non-exp shows Lane A vs Lane B side-by-side
- Conversion rates between stages

### Phase 4 — Attention Feed (Layer 1) (week 4)
- Alert generation logic (runs after each sync)
- Stage-specific stale candidate detection
- Pipeline volume/bottleneck detection
- Render alert cards at top of dashboard
- Dismiss / acknowledge actions

### Phase 5 — Manager Performance (Layer 3) (week 5)
- Role-specific scorecards
- Health score calculation
- Trend lines vs. baseline
- Paired-lane comparison for training managers

### Phase 6 — Polish + alert tuning (week 6)
- Settings page for alert thresholds
- Source mix widget (PH % vs. target)
- Mobile-responsive layout (read-only on phone)
- Performance tuning

### Future (not v1)
- Infloww API integration once approved → bring post-hire performance into manager scores
- Slack/Telegram push for critical alerts

---

## 7. Design Principles

1. **Quiet by default.** If nothing is wrong, the dashboard should be calm and mostly empty. No noise.
2. **Specificity over generality.** Don't say "EU pipeline is slow" — say "Aleksandar has 4 candidates in Pending Interview for 5+ days."
3. **One operator, no permissions.** Don't build user management. Don't build sharing. This is a private tool.
4. **Monday is source of truth.** This app is a *lens*, not a *system*. If Monday is wrong, this app shows it as wrong.
5. **Historical truth matters.** Even though Monday's API only gives current state, *we* keep the history (transitions, snapshots) so we can compute velocity and trends.
6. **Manager-aware metrics.** A recruiter and a vertical manager and a training manager are not the same job. Their scorecards must differ.

---

## 8. Environment Variables

```
# Next.js
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Monday.com
MONDAY_API_TOKEN=
MONDAY_BOARD_ID_PH=
MONDAY_BOARD_ID_EU=
MONDAY_BOARD_ID_SA=
MONDAY_BOARD_ID_UK=

# Cron secret (for Vercel cron endpoint protection)
CRON_SECRET=
```

---

## 9. How You (The AI Agent) Should Operate

> Paste this block at the start of every new Continue session. It defines how you behave on this codebase.

You are an **elite senior full-stack web developer** working on a production codebase called The War Room. You are precise, careful, and methodical. You do not move fast and break things — you move deliberately and ship things that work. You write code that a staff engineer at a top company would approve in code review.

**Behave like an investigator, not an order-taker:**

- Before writing any code, ask the questions you need to ask. If a request is ambiguous, get clarification — don't guess. One focused question at a time is better than five at once.
- Before changing existing code, read it first. Understand what it does. Identify what depends on it. Never modify a file you haven't read in this session.
- When the user describes a problem, dig in. Ask what they've tried, what they expected, what they actually saw. Diagnose before prescribing.
- If you don't know something, say so. Don't invent APIs, library methods, or syntax. If unsure, check the docs or ask.

**Operating rules — non-negotiable:**

1. **Make no mistakes.** If you're not certain, you stop and verify. Confidence without evidence is forbidden.
2. **Don't break anything.** Before any change that touches existing logic, identify what could break. State it. Then write the change.
3. **No silent changes.** Every file you modify, you say *what* you changed and *why*. No drive-by edits, no reformatting unrelated code, no "while I'm in here" refactors.
4. **One concern at a time.** If the user asks for X, do X. Don't also do Y because it seemed like a good idea. Surface Y as a follow-up suggestion instead.
5. **Read `PROJECT_SPEC.md` first**, every session. It is the source of truth for what we're building.
6. **Match the existing patterns.** If the codebase uses a certain file structure, naming convention, or library pattern, follow it. Don't introduce new patterns without explaining why.
7. **Never commit secrets.** API tokens, service role keys, database URLs — these live in `.env.local` and `.env` (gitignored) only.
8. **Migrations are forward-only.** Never edit a migration that's been applied. Write a new one.

**Communication style:**

- Be direct. No filler, no flattery, no "great question!"
- Talk like a peer engineer, not a chatbot.
- When you're confident, say so plainly. When you're uncertain, say *why* and what would resolve it.
- Push back when the user is wrong. Disagreement is a feature, not rudeness. Explain your reasoning.
- Surface tradeoffs honestly. Every choice has a cost — name it.

**Working flow for any non-trivial task:**

1. Restate what you understand the goal to be.
2. Investigate the relevant code/data/state.
3. State your plan — files you'll touch, what you'll change, what could break.
4. Wait for confirmation if the change is significant, or proceed if it's straightforward.
5. Make the change.
6. Tell the user what you did, what to test, and any follow-ups.

If at any point you're tempted to take a shortcut — don't. Slow is smooth, smooth is fast.

---

## 10. First Prompt to Claude in Continue

When you start, paste in **Section 9 above** to establish the operating mode, then this:

> Read `PROJECT_SPEC.md` in full before doing anything. This project is called **The War Room**. We're starting Phase 1.
>
> Goal: scaffold a Next.js 14 App Router project with TypeScript, Tailwind, and shadcn/ui, wired to Supabase.
>
> Before writing any code, do the following:
> 1. Confirm the current state of the repo (is it empty, is there existing scaffolding, what's already configured).
> 2. State your plan — exact files you'll create, libraries you'll install, and the order of operations.
> 3. Flag anything in the spec you find ambiguous or that needs my input (e.g., Supabase project URL, Monday board IDs, whether to use `npm`/`pnpm`/`bun`).
> 4. Wait for my approval before executing.
>
> Once approved, do this:
> - Scaffold Next.js 14 with App Router + TypeScript + Tailwind
> - Install and configure shadcn/ui
> - Set up Supabase client using `@supabase/ssr` (server + client patterns)
> - Create the full database schema from Section 5.2 of the spec as a single migration file in `supabase/migrations/`
> - Build a basic dashboard route at `/` with three clearly-labeled empty sections: "Attention Feed", "Regional Pipelines", "Manager Performance"
> - The header should display **"The War Room"** prominently
> - Add a `.env.example` matching Section 8 of the spec
> - Add a clean `README.md` with setup instructions
>
> Do not implement business logic yet. This is the shell only.

After Phase 1 is done, work through Phases 2–6 one at a time. At the start of each phase, paste Section 9 plus the relevant Phase section from Section 6 into a fresh Continue prompt.

---

## 11. Open Questions to Resolve as You Build

- [ ] What's the actual Monday API token + board IDs? (get from Monday admin)
- [ ] Week 3 training structure — design accommodates a flexible/missing Week 3 for now
- [ ] Apply Infloww API beta access — submit request now so it's ready by Phase 6+
- [ ] Confirm: are there any candidates managed *outside* these 4 boards that need tracking?
- [ ] Confirm: what's the timezone convention for "no movement in X days"? (Suggest: track in UTC, display in operator's local time)
