import { NextRequest, NextResponse } from 'next/server'
import {
  getDashboardStats,
  getBriefingData,
  getCurrentAlerts,
  getBoardSummary,
  getTopCreators,
  getActiveCreatorCount,
  getLastSyncedAt,
  getRecentMovements,
  listCandidates,
  getStaleCandidates,
  getStageDeltas,
  getManagerActivity,
  getDepartmentMovements,
} from '@/lib/db'
import type { Region } from '@/lib/candidates'
import { displayName, PH_SECTION_MANAGERS, GROUP_ORDER, OVERSEERS, BOARD_TO_AE } from '@/lib/manager_sections'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

type Msg = { role: 'user' | 'assistant'; content: string }

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

function fmt$(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function pctStr(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n * 100) + '%'
}

async function buildContext(): Promise<string> {
  const supabase = createAdminClient()
  const regions: Region[] = ['PH', 'EU', 'SA', 'UK']
  const [
    stats,
    briefing,
    alerts,
    boardSummary,
    topCreators,
    activeCreators,
    lastSync,
    recentMoves,
    allCandidates,
    pagesRes,
    deptMovements,
    stageDeltas,
    managerActivity,
    stalePH,
    staleEU,
    staleSA,
    staleUK,
  ] = await Promise.all([
    getDashboardStats(),
    getBriefingData(),
    getCurrentAlerts(),
    getBoardSummary(),
    getTopCreators(10),
    getActiveCreatorCount(),
    getLastSyncedAt(),
    getRecentMovements(40),
    listCandidates({ limit: 5000 }),
    supabase.from('page_board_map')
      .select('page_name, board_name, running_sales, goal, active, agency, pod_label, manager')
      .order('running_sales', { ascending: false, nullsFirst: false })
      .limit(500),
    getDepartmentMovements(),
    getStageDeltas(1),
    getManagerActivity(),
    getStaleCandidates('PH', 5, 50),
    getStaleCandidates('EU', 5, 50),
    getStaleCandidates('SA', 5, 50),
    getStaleCandidates('UK', 5, 50),
  ])
  const staleByRegion: Record<Region, typeof stalePH> = { PH: stalePH, EU: staleEU, SA: staleSA, UK: staleUK }

  const lines: string[] = []
  lines.push('═══ WAR ROOM LIVE STATE ═══')
  lines.push(`Last synced: ${lastSync ?? 'never'}`)
  lines.push(`Today: ${new Date().toISOString().split('T')[0]}`)
  lines.push('')

  // Pipeline by region × bucket
  lines.push('─── PIPELINE (counts by region × stage) ───')
  const buckets = ['typeform', 'passed', 'pending', 'scheduled', 'training', 'standby', 'active'] as const
  lines.push(`region  | ${buckets.map(b => b.padEnd(9)).join(' ')} | off`)
  for (const r of regions) {
    const row = stats.byRegion[r]
    const off = stats.offboardedByRegion[r]
    lines.push(`${r.padEnd(7)} | ${buckets.map(b => String(row[b]).padEnd(9)).join(' ')} | ${off}`)
  }
  lines.push(`TOTAL in pipeline: ${stats.inPipeline} · total ever seen: ${stats.totalAll}`)
  lines.push('')

  // 24h briefing
  lines.push('─── LAST 24 HOURS ───')
  lines.push(`New candidates: ${briefing.newLast24h}`)
  lines.push(`Stage transitions: ${briefing.transitions24h}`)
  lines.push(`Interviews scheduled/pending: ${briefing.interviews}`)
  lines.push(`At-risk (tier 1/2) total: ${briefing.atRiskTotal}`)
  lines.push(`Top tier (tier 3/4) total: ${briefing.topTierTotal}`)
  if (briefing.atRiskInTraining.length) {
    lines.push(`At-risk currently in training:`)
    for (const c of briefing.atRiskInTraining) {
      lines.push(`  · ${c.name} (${c.region}, ${c.current_group_title ?? c.current_stage}, tier=${c.tier ?? '—'}, mgr=${c.assigned_manager ?? '—'})`)
    }
  }
  if (briefing.topTier.length) {
    lines.push(`Top tier (T4) candidates:`)
    for (const c of briefing.topTier) {
      lines.push(`  · ${c.name} (${c.region}, ${c.current_group_title ?? c.current_stage}, mgr=${c.assigned_manager ?? '—'})`)
    }
  }
  lines.push('')

  // Open alerts
  lines.push(`─── OPEN ALERTS (${alerts.length}) ───`)
  for (const a of alerts.slice(0, 30)) {
    const who = a.candidateName ? ` — ${a.candidateName}` : ''
    lines.push(`[${a.severity.toUpperCase()}] ${a.region} · ${a.type} · ${a.title}${who} (${a.meta})`)
  }
  if (alerts.length > 30) lines.push(`… +${alerts.length - 30} more alerts`)
  lines.push('')

  // Revenue boards
  lines.push('─── REVENUE BOARDS ───')
  lines.push(`Active chatter pages: ${activeCreators}`)
  for (const b of boardSummary.boards) {
    lines.push(`${b.boardName}: ${fmt$(b.runningSales)} running / ${fmt$(b.goal)} goal (${pctStr(b.pctToGoal)}) · ${b.activeCount ?? 0} pages · ratio ${b.ratio ?? '—'} · ↑${b.upCount ?? 0} ↓${b.downCount ?? 0}`)
  }
  if (boardSummary.totals) {
    const t = boardSummary.totals
    lines.push(`TOTALS: ${fmt$(t.runningSales)} / ${fmt$(t.goal)} (${pctStr(t.pctToGoal)}) · ${t.activeCount} pages · proj ${fmt$(t.projection)}`)
  }
  lines.push('')

  // Top revenue pages
  lines.push('─── TOP REVENUE PAGES ───')
  for (const c of topCreators) {
    lines.push(`${c.pageName} — ${fmt$(c.runningSales)} · ${c.boardName}${c.agency ? ' · ' + c.agency : ''}`)
  }
  lines.push('')

  // All pages (active chatter directory)
  type Page = { page_name: string; board_name: string; running_sales: number | null; goal: number | null; active: boolean | null; agency: string | null; pod_label: string | null; manager: string | null }
  const pages = (pagesRes.data ?? []) as Page[]
  lines.push(`─── ACTIVE PAGES (${pages.filter(p => p.active !== false).length} of ${pages.length}) ───`)
  lines.push('page | board | $ run | $ goal | agency | pod | mgr | active')
  for (const p of pages) {
    if (p.active === false) continue
    lines.push(`${p.page_name} | ${p.board_name} | ${fmt$(p.running_sales)} | ${fmt$(p.goal)} | ${p.agency ?? '—'} | ${p.pod_label ?? '—'} | ${p.manager ?? '—'}`)
  }
  lines.push('')

  // Candidate directory (compact)
  lines.push(`─── CANDIDATE DIRECTORY (${allCandidates.length}) ───`)
  lines.push('name | region | stage | tier | track | manager')
  for (const c of allCandidates) {
    if (c.current_stage === 'offboarded') continue
    lines.push(`${c.name} | ${c.region} | ${c.current_group_title ?? c.current_stage} | ${c.tier ?? '—'} | ${c.track ?? '—'} | ${c.assigned_manager ? displayName(c.assigned_manager) : '—'}`)
  }
  lines.push('')

  // Recent movements
  lines.push(`─── RECENT STAGE MOVEMENTS (last ${recentMoves.length}) ───`)
  for (const m of recentMoves) {
    lines.push(`${m.detectedAt} · ${m.candidateName} (${m.region}): ${m.fromStage ?? '∅'} → ${m.toStage}`)
  }
  lines.push('')

  // Department-level movements (per region)
  lines.push('─── DEPARTMENT MOVEMENTS (24h) ───')
  lines.push('region | inPipeline | new24h | trans24h | →training | →standby | →active | offboarded')
  for (const d of deptMovements) {
    lines.push(`${d.region} | ${d.inPipeline} | ${d.newLast24h} | ${d.transitions24h} | ${d.enteredTraining24h} | ${d.enteredStandby24h} | ${d.enteredActive24h} | ${d.offboarded24h}`)
  }
  lines.push('')

  // Stage-level movements (where things flowed yesterday → today)
  if (stageDeltas.length > 0) {
    lines.push(`─── STAGE DELTAS (yesterday → today, |Δ|≥1) ───`)
    for (const d of stageDeltas.slice(0, 40)) {
      const sign = d.delta > 0 ? '+' : ''
      lines.push(`${d.region} · ${d.groupTitle}: ${d.yesterdayCount} → ${d.todayCount} (${sign}${d.delta})`)
      if (d.enteredStage.length > 0) lines.push(`    entered: ${d.enteredStage.map(e => `${e.name} (from ${e.fromStage ?? '∅'})`).join(', ')}`)
      if (d.leftStage.length > 0) lines.push(`    left: ${d.leftStage.map(e => `${e.name} (to ${e.toStage})`).join(', ')}`)
    }
    lines.push('')
  }

  // Manager activity (productivity)
  lines.push(`─── MANAGER ACTIVITY (24h, configured roster only) ───`)
  lines.push('manager | role | assigned | new24h | trans24h | →training | →standby | →active | offboarded')
  for (const m of managerActivity) {
    lines.push(`${m.displayName} | ${m.role} | ${m.candidatesAssigned} | ${m.newLast24h} | ${m.transitions24h} | ${m.enteredTraining24h} | ${m.enteredStandby24h} | ${m.enteredActive24h} | ${m.offboarded24h}`)
    if (m.enteredTrainingNames.length > 0) lines.push(`    → training: ${m.enteredTrainingNames.join(', ')}`)
    if (m.enteredActiveNames.length > 0) lines.push(`    → active: ${m.enteredActiveNames.join(', ')}`)
    if (m.offboardedNames.length > 0) lines.push(`    offboarded: ${m.offboardedNames.join(', ')}`)
  }
  lines.push('')

  // Stale candidates (stuck in pipeline)
  lines.push(`─── STALE CANDIDATES (≥5 days since Monday update, by region) ───`)
  for (const r of regions) {
    const list = staleByRegion[r]
    if (list.length === 0) continue
    lines.push(`${r}: ${list.length} stale`)
    for (const c of list) {
      lines.push(`  · ${c.name} | ${c.current_group_title ?? c.current_stage} | tier=${c.tier ?? '—'} | mgr=${c.assigned_manager ?? '—'} | ${c.daysSinceUpdate}d idle`)
    }
  }
  lines.push('')

  // Org structure reference
  lines.push('─── ORG STRUCTURE ───')
  lines.push('Overseers / leadership:')
  for (const o of OVERSEERS) {
    lines.push(`  · ${o.display} — ${o.role}${o.scope.length ? ' [' + o.scope.join(', ') + ']' : ''}`)
  }
  lines.push('PH section managers (by Monday group):')
  for (const s of PH_SECTION_MANAGERS) {
    lines.push(`  · ${s.groupTitle}: ${s.managers.join(', ')}${s.shift ? ' [' + s.shift + ']' : ''}`)
  }
  lines.push('Account Executives by revenue board:')
  for (const [board, ae] of Object.entries(BOARD_TO_AE)) {
    lines.push(`  · ${board} → ${ae}`)
  }
  lines.push('Region group order (Monday top→bottom):')
  for (const r of regions) {
    lines.push(`  · ${r}: ${GROUP_ORDER[r].join(' → ')}`)
  }
  lines.push('')

  // Hard-coded operational rules from CLAUDE memory
  lines.push('─── OPERATIONAL RULES ───')
  lines.push('Tier scale (Monday → tier column): Tier 1 = WEAKEST, Tier 4 = BEST. Inverted from typical intuition.')
  lines.push('Interview/training rotation: interview week and training week alternate — managers cannot do both in the same week.')
  lines.push('Active vs blank checkbox: a page is "active" unless explicitly marked FALSE. Blank/NULL = active.')
  lines.push('Boards: BOARD 1, BOARD 2, BOARD 3, TRAINING BOARD, TOWER. Pages live under boards; chatters work pages.')
  lines.push('Regions: PH (Philippines), EU (Europe), SA (South America), UK (United Kingdom). Each has its own Monday board.')
  lines.push('Stages live in current_group_title (raw Monday) and current_stage (normalized). The directory above uses raw Monday titles.')

  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ reply: 'AI not configured — add ANTHROPIC_API_KEY to .env.local (and Vercel env vars).' })
  }

  let body: { messages: Msg[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ reply: 'Bad request: expected JSON { messages: [...] }' }, { status: 400 })
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ reply: 'No messages.' }, { status: 400 })
  }

  let context: string
  try {
    context = await buildContext()
  } catch (e) {
    return NextResponse.json({ reply: `Couldn't load War Room data: ${(e as Error).message}` }, { status: 500 })
  }

  const system = `You are Keit Dmitrijev's chief-of-staff analyst inside The War Room — the operating system for his multi-region OnlyFans chat agency (PH, EU, SA, UK). You have the FULL current state of the War Room below. Your job is to be the analyst who actually tells him what to do, not the assistant that hedges.

${context}

WHO YOU ARE
You are an opinionated operator. Keit hired you to think for him on this business. He's already got people who say "it depends" — he needs someone who reads the room, identifies who's slipping, who's winning, where the bottlenecks are, and makes specific calls. You speak in recommendations, not disclaimers.

WHAT YOU SHOULD DO PROACTIVELY
- Flag people who should be FIRED / offboarded (tier 1 stuck in advanced training, idle too long, low manager engagement, dragging the team). Name them.
- Flag people who should be PROMOTED / moved (tier 4 in training who are ready for active, top performers underused, candidates ready to graduate).
- Flag MANAGERS who are underperforming (low transitions, lots of stale candidates assigned to them, weak tier distribution under them).
- Flag BOARDS that are dropping (% to goal slipping, ratio sliding, top creators leaving).
- Surface BOTTLENECKS (stages where candidates pile up, regions stalling).
- Make REVENUE PROJECTIONS based on running-sales vs days remaining in the month.
- Call out PATTERNS — same manager keeps producing weak candidates? Same agency keeps producing winners? Say it.
- When asked open-ended things ("how are we doing"), give a real assessment with a verdict, not a data dump.

ANSWERING RULES
- The data above IS ground truth. Use it. Don't invent names, numbers, stages, or relationships.
- BUT — be FUZZY on user input. If Keit types "Sebastien" and the directory has "Juan Sebastian Gonzalez Perez," that's the same person (English vs French spelling, partial name, casual nickname → match it). Same goes for "Andrei" matching "Andrei Angelo Cando", "Pamela" matching "Pamela Amuro Miña", etc. ALWAYS attempt a partial/fuzzy match on names before saying "not found".
- The ORG STRUCTURE section is the source of truth for who is a manager. Juan Sebastian Gonzalez Perez (SA Head), Aleksandar Simic (EU Head), Noah Whall (UK Head), and the PH section managers ARE managers even if they don't appear elsewhere — never say "no such manager" if they're in the org structure.
- "Where is X?" → fuzzy-match the name. Report region, stage, manager, tier (and revenue if a page). If X is a manager, report their role, what region/section they own, and how their team is performing.
- For aggregates, recompute from the data; show 1-2 numbers as proof so Keit can sanity-check, then give your verdict.
- Tier scale is INVERTED: Tier 1 = weakest, Tier 4 = strongest. Never reverse this.
- Active checkbox: blank = active. Only FALSE means inactive.
- Be concise. Short bullets, not paragraphs. Format currency as $1,234. Lead with the answer, then the reasoning.
- When you make a recommendation, name names and give a one-line reason. Don't list "considerations."
- If the data genuinely doesn't support an answer (and fuzzy-matching fails), say so in one line — don't pad.
- Format references to candidates as plain text, not links.

YOUR DEFAULT POSTURE: confident, specific, action-oriented. Keit is paying you to tell him what he should do. Tell him.`

  const apiMessages = body.messages.slice(-12).map(m => ({ role: m.role, content: m.content }))

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system,
        messages: apiMessages,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ reply: `AI error (${res.status}): ${text.slice(0, 400)}` }, { status: res.status })
    }
    const data = await res.json()
    const reply = data?.content?.[0]?.text ?? 'No response.'
    return NextResponse.json({ reply })
  } catch (e) {
    return NextResponse.json({ reply: `AI request failed: ${(e as Error).message}` }, { status: 500 })
  }
}
