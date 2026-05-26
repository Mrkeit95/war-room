/**
 * Model onboarding capacity math + DB reads.
 * Server-only. Pairs the `models` table (synced from Monday) with the
 * standby pool in the `candidates` table to answer:
 * "do we have enough chatters to staff the next round of pages?"
 */

import { createAdminClient } from './supabase/admin'

// Capacity rule (per user): every $40k of revenue = 1 team = 4 chatters
// for 24h coverage. Sub-$40k pages are paired off and excluded.
export const REVENUE_PER_TEAM = 40_000
export const CHATTERS_PER_TEAM = 4
export const MIN_REVENUE_FOR_CAPACITY = 40_000

export type Model = {
  id: string
  monday_item_id: string
  name: string
  agency: string | null
  page_type: string | null
  revenue: number | null
  start_date: string | null
  board: string | null
  ae: string | null
  status: string | null
  telegram_group: string | null
  marketing: string | null
  group_title: string | null
}

export type ModelWithCapacity = Model & {
  teamsNeeded: number
  chattersNeeded: number
  daysUntilStart: number | null
}

export function teamsForRevenue(revenue: number | null | undefined): number {
  if (!revenue || revenue < MIN_REVENUE_FOR_CAPACITY) return 0
  return Math.ceil(revenue / REVENUE_PER_TEAM)
}

export function chattersForRevenue(revenue: number | null | undefined): number {
  return teamsForRevenue(revenue) * CHATTERS_PER_TEAM
}

export function daysUntil(startDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!startDate) return null
  const start = new Date(startDate + 'T00:00:00Z').getTime()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((start - today) / 86_400_000)
}

/**
 * The "current onboarding batch" lives in a Monday group titled with a date
 * range like "05/25 - 05/28". Multiple such groups exist (one per week, kept
 * around as history). The active one is the group whose range covers today
 * — or the next upcoming one if we're between weeks.
 */
type DateRangeGroup = { title: string; start: Date; end: Date }

function parseDateRangeGroup(title: string, referenceYear: number): DateRangeGroup | null {
  // Matches "05/25 - 05/28", "5/25 – 5/28", "05/25-05/28" etc.
  const m = title.match(/(\d{1,2})\/(\d{1,2})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  const start = new Date(referenceYear, parseInt(m[1], 10) - 1, parseInt(m[2], 10))
  let end = new Date(referenceYear, parseInt(m[3], 10) - 1, parseInt(m[4], 10))
  // Handle year-wrap (e.g. "12/30 - 01/05")
  if (end.getTime() < start.getTime()) {
    end = new Date(referenceYear + 1, parseInt(m[3], 10) - 1, parseInt(m[4], 10))
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return { title, start, end }
}

async function findActiveOnboardingGroupTitle(now: Date): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('models')
    .select('group_title')
    .not('group_title', 'is', null)
  if (error) throw new Error(`findActiveOnboardingGroupTitle: ${error.message}`)

  const titles = [...new Set((data ?? []).map(r => (r as { group_title: string }).group_title))]
  const year = now.getFullYear()
  const todayMs = now.getTime()

  const ranges: DateRangeGroup[] = []
  for (const t of titles) {
    // Try current year, plus prior year (in case data is older than CY boundary)
    const cy = parseDateRangeGroup(t, year)
    if (cy) ranges.push(cy)
    const py = parseDateRangeGroup(t, year - 1)
    if (py && py.end.getTime() >= todayMs - 365 * 86_400_000) ranges.push(py)
  }
  if (ranges.length === 0) return null

  // 1. A range that contains today — that's the current week
  const containing = ranges.find(r => todayMs >= r.start.getTime() && todayMs <= r.end.getTime())
  if (containing) return containing.title

  // 2. Otherwise, the soonest upcoming range
  const future = ranges.filter(r => r.start.getTime() > todayMs).sort((a, b) => a.start.getTime() - b.start.getTime())
  if (future[0]) return future[0].title

  // 3. Otherwise, the most recent past range
  const past = ranges.filter(r => r.end.getTime() < todayMs).sort((a, b) => b.end.getTime() - a.end.getTime())
  return past[0]?.title ?? null
}

/**
 * Models in the current onboarding batch (the active date-range group on Monday).
 * Excludes anything explicitly marked ACTIVE.
 */
export async function getUpcomingModels(): Promise<ModelWithCapacity[]> {
  const supabase = createAdminClient()
  const now = new Date()
  const activeGroup = await findActiveOnboardingGroupTitle(now)
  if (!activeGroup) return []

  const { data, error } = await supabase
    .from('models')
    .select('id, monday_item_id, name, agency, page_type, revenue, start_date, board, ae, status, telegram_group, marketing, group_title')
    .eq('group_title', activeGroup)
    .or('status.is.null,status.neq.ACTIVE')
    .order('start_date', { ascending: true })
  if (error) throw new Error(`getUpcomingModels: ${error.message}`)

  return (data ?? []).map(m => ({
    ...(m as Model),
    teamsNeeded: teamsForRevenue(m.revenue),
    chattersNeeded: chattersForRevenue(m.revenue),
    daysUntilStart: daysUntil(m.start_date, now),
  }))
}

/**
 * Global standby supply: chatters in the standby stage with no board assignment.
 * Matches the /standby page's "no BOARD assigned" count exactly so the numbers
 * agree across the app.
 */
export async function getAvailableStandbyCount(): Promise<number> {
  const supabase = createAdminClient()
  // Fetch board_assignment and filter in JS so whitespace-only values are treated
  // as empty (matches /standby's `!board_assignment?.trim()` logic).
  const PAGE = 1000
  let from = 0
  let available = 0
  while (true) {
    const { data, error } = await supabase
      .from('candidates')
      .select('board_assignment')
      .eq('current_stage', 'standby')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`getAvailableStandbyCount: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data as { board_assignment: string | null }[]) {
      if (!row.board_assignment?.trim()) available += 1
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return available
}

export type OnboardingSnapshot = {
  models: ModelWithCapacity[]
  totalChattersNeeded: number
  availableStandby: number
  coverage: 'covered' | 'short'
  shortBy: number
}

export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot> {
  const [models, availableStandby] = await Promise.all([
    getUpcomingModels(),
    getAvailableStandbyCount(),
  ])
  const totalChattersNeeded = models.reduce((sum, m) => sum + m.chattersNeeded, 0)
  const shortBy = Math.max(0, totalChattersNeeded - availableStandby)
  return {
    models,
    totalChattersNeeded,
    availableStandby,
    coverage: shortBy === 0 ? 'covered' : 'short',
    shortBy,
  }
}
