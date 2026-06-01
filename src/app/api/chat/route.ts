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
} from '@/lib/db'
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
  ] = await Promise.all([
    getDashboardStats(),
    getBriefingData(),
    getCurrentAlerts(),
    getBoardSummary(),
    getTopCreators(10),
    getActiveCreatorCount(),
    getLastSyncedAt(),
    getRecentMovements(20),
    listCandidates({}),
    supabase.from('page_board_map')
      .select('page_name, board_name, running_sales, goal, active, agency, pod_label, manager')
      .order('running_sales', { ascending: false, nullsFirst: false })
      .limit(500),
  ])

  const lines: string[] = []
  lines.push('═══ WAR ROOM LIVE STATE ═══')
  lines.push(`Last synced: ${lastSync ?? 'never'}`)
  lines.push(`Today: ${new Date().toISOString().split('T')[0]}`)
  lines.push('')

  // Pipeline by region × bucket
  lines.push('─── PIPELINE (counts by region × stage) ───')
  const regions: Array<'PH' | 'EU' | 'SA' | 'UK'> = ['PH', 'EU', 'SA', 'UK']
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

  const system = `You are the AI operations assistant inside The War Room, the dashboard Keit Dmitrijev uses to run a multi-region OnlyFans chat agency (PH, EU, SA, UK). You have the entire current state of the War Room below.

${context}

ANSWERING RULES
- Use the data above as ground truth. Do not invent names, numbers, stages, or managers.
- "Where is X?" → look up X in the candidate directory or pages list and report region, stage, manager, tier (and revenue if a page).
- "Who's at risk?" or "Who needs attention?" → use the open alerts and the at-risk-in-training list.
- "How are the boards doing?" → use the Revenue Boards section.
- "What changed?" or "what's new?" → use Last 24 Hours + Recent Stage Movements.
- For any aggregate question (counts, sums), recompute from the data above; show your inputs briefly so the operator can sanity-check.
- Tier scale is inverted: Tier 1 = weakest, Tier 4 = strongest. Never reverse this.
- Be concise. Use short bullets, not paragraphs. Format currency as $1,234.
- If the answer truly isn't in the data, say so directly — do not guess.
- Format references to candidates as plain text, not links.`

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
