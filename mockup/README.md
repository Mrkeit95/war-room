# The War Room

A command center for tracking chatter recruiting and training across 4 regional pipelines (Philippines, Europe, South America, United Kingdom).

## What's in this folder

```
war-room/
├── index.html              ← The static mockup. Open in a browser to see.
├── README.md               ← This file.
└── docs/
    ├── PROJECT_SPEC.md     ← The full build spec — read this before opening VS Code.
    └── NOTES.md            ← Decisions made during design, in plain language.
```

## What this is

A complete, navigable visual mockup of The War Room with every screen designed:

- **Dashboard** — hero metrics, department cards, action list, top performers, upcoming, source mix
- **Morning briefing** — editorial single-page summary for daily reading
- **Pipeline** — full Kanban view of every candidate across every stage, filterable by region
- **Candidates** — searchable, filterable table of all candidates
- **Calendar** — month-grid view of interviews, cohort milestones, manager check-ins
- **Department pages** (4) — deep-dive per region with KPIs, pipeline breakdown, grade distribution
- **Top performers** — A-graded candidates trending up
- **At risk** — D/F-graded or trending down
- **Activity log** — chronological feed of stage changes and grade updates
- **Settings** — 6 sub-sections including general, account, alerts, dashboard preferences, integrations, advanced

Click anything. Search candidates. Switch time views. Add reminders. Mark items done. Every screen is reachable.

## What this is NOT

This is a static HTML mockup with mock data. It is not connected to Monday.com. It does not have a backend. It does not persist between page reloads. It is a **visual specification and design reference** to be used as the foundation for the real build.

## How to view it

Just open `index.html` in any modern browser. Or drop the folder onto Vercel and you get a public link.

To deploy:
1. Push this folder to a GitHub repo
2. Connect that repo on vercel.com
3. Get a public URL

## How to use it for the real build

When you open VS Code with Continue, the workflow is:

1. **Read `docs/PROJECT_SPEC.md` in full** — it defines the architecture, tech stack, database schema, and phases
2. **Paste Section 9 of the spec** at the start of every Continue session to set the AI's operating mode
3. **Use Section 10's kickoff prompt** to start Phase 1
4. **Keep `index.html` open in a browser tab** as the visual reference for what you're building toward

The mockup tells Claude in Continue what every screen should *look like* and *do*. The spec tells it how to build it.

## What this folder doesn't have

- Real data connections (Monday API, Supabase, Infloww)
- Authentication
- Persistent state
- Server-side anything

All of that gets built in the real Next.js project per the spec. This folder is just the static design artifact and the build instructions.

## Stack the real build will use

- Next.js 14 + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Postgres + Auth)
- Monday.com GraphQL API
- Vercel hosting
- GitHub source control
