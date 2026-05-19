# War Room — Design Decisions

Plain-language notes on every meaningful decision made during the design process. Read this before changing direction.

## The core insight

The operator (you) is the bottleneck because you're the only one with the full picture across 4 regional pipelines, but no one human can hold 487+ candidates and 10+ managers in their head. Things slip, you find out late.

**The dashboard's job is to invert this.** Instead of you chasing managers for updates, the system surfaces what needs attention so your follow-ups are pointed and specific.

## What it's NOT

This is not "a prettier Monday." It's a *task list that builds itself from your operation*. The list is the product — everything else is decoration around it.

## The operation it tracks

**4 regional pipelines, each with its own Monday board:**

| Region | Manager(s) | Structure |
|---|---|---|
| Philippines | Apple, Darla, Pauline | Specialists — recruit only; hand off to dedicated training teams |
| Europe | Aleksandar | Vertical — owns whole funnel |
| South America | Sebastien | Vertical — owns whole funnel |
| United Kingdom | Noah | Vertical — owns whole funnel |

**Universal pipeline shape:**
`Typeform → Interview → Training → Active (exits dashboard)`

**Training varies:**
- PH Experienced: Training Board, 1 week, 2 managers across 2 shifts
- PH Non-Experienced: Week 1 (Lane A or B) → Week 2 (paired) → Week 3 (TBD)
- Europe / SA / UK: Regional manager runs their own Exp + Non-Exp tracks

**Strategic goal:** Shift hiring mix from current 82% PH to 25% PH long-term. The dashboard surfaces this so the goal is visible.

## What the dashboard does (and doesn't do)

**Does:**
- Pulls data from all 4 Monday boards
- Stores history (Monday only gives current state — we keep snapshots)
- Computes velocities, trends, conversion rates
- Generates auto-alerts (stuck candidates, manager inactivity, low intake)
- Surfaces standout candidates AND at-risk candidates
- Lets the operator add personal reminders (mixed into the same list)

**Doesn't (v1):**
- User management / multiple accounts (single operator)
- Two-way sync with Monday (read-only)
- Notify the team (operator-only tool)
- Pull post-hire performance (Infloww — Phase 6+, requires beta API access)

## Items the system shows

**System-generated items are stubborn.** Can't be dismissed or snoozed. Only check off (marked done by the operator) or auto-clear (when the underlying condition resolves). This prevents the operator from ignoring real problems.

**Personal reminders are flexible.** Plain text, hit enter to add, check to remove. No tags, no due dates — speed matters.

**Item types:**
- **Critical** — stuck candidates, dead pipelines
- **Spotlight** — standout candidates trending up (recognition matters too)
- **Today's check-ins** — recurring rhythm with managers
- **Forecast** — what's expected to happen this week based on grades + history
- **Watch list** — softer warnings (low intake, lane comparisons, manager silences)
- **Personal** — operator-added reminders

## The grading layer (hypothetical, requires Monday changes)

For this to actually work, Monday needs new columns the team will fill in daily:

- **Grade** (A-F) — overall current quality
- **Engagement** (High / Medium / Low / Ghosting)
- **Manager notes** (free text, updated regularly)
- **Last update by manager** (auto-date — forces accountability)
- **Red flags** (multi-select tags: "Late replies", "Grammar", etc.)
- **Strengths** (multi-select tags: "Fast learner", "Personality", etc.)
- Daily scores for training stages (1-10)

Without these columns, the dashboard can only show *location* (where someone is in the funnel), not *quality* (how they're doing). The full vision requires this data to exist.

## Three time views

- **Today** — fires of the day, action list
- **This week** — cohorts ending, manager check-ins planned, weekly themes
- **Next week** — cohorts starting, decisions needed, planning ahead

## Search

Type any candidate's name in the topbar. Results show grade, region, stage. Click to open full profile.

## Candidate detail (modal)

Click any candidate anywhere. Get:
- Header with grade, trajectory, current stage, tags
- **Journey timeline** — every stage change, grade, milestone with date and notes
- **Private notes section** — operator-only notes that don't go back to Monday

## Visual language

- **Pure black** background with very subtle lifted surfaces — cards float on the canvas
- **Inter** for UI text, **JetBrains Mono** for numbers/grades/dates
- **Tight letter-spacing** on big numbers (-0.025em) — looks expensive
- **Performance-gradient coloring**: green (good) → yellow → amber → orange → red (bad). The *color of the number* tells you the temperature.
- **Big numbers as heroes**, tiny uppercase labels above them
- **Generous spacing** between sections; no clutter
- Quiet by default. If nothing's wrong, the dashboard is calm.

## Logo

Pure wordmark: "WAR ROOM" in bold caps with tracking 0.32em, thin divider line beneath. No icon. No mark.

## Tech stack for the real build

- Next.js 14 (App Router) + TypeScript
- Tailwind + shadcn/ui
- Supabase (Postgres + Auth)
- Monday.com GraphQL API
- Vercel + GitHub

## Phases (from PROJECT_SPEC.md)

1. Foundation — scaffold project + DB schema
2. Data sync — Monday API + Supabase cache + cron
3. Regional pipelines — render funnel views
4. Attention feed — alert generation
5. Manager performance — role-specific scorecards
6. Polish + Infloww integration

## Open questions for the real build

- Get Monday API token + 4 board IDs
- Apply for Infloww API beta access (will be needed by Phase 6)
- Confirm Week 3 training structure once it exists
- Stage normalization across the 4 boards (group labels are inconsistent — see spec Section 5.3)

## Things we considered and chose NOT to build

- Multiple user accounts / role-based access (overkill for v1)
- Auto-messaging to managers when alerts fire (undermines operator's relationships)
- Charts and graphs (productive-feeling, rarely actionable)
- Manager leaderboards (creates weird incentives)
- Push notifications (defeats the "you go to it, not it to you" design)
