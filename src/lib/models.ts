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
  chattersAlreadyAssigned: number
  chattersStillNeeded: number          // max(0, chattersNeeded - chattersAlreadyAssigned)
  pod: string | null                   // from the chatter schedule board group title
  team: string | null
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

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * For each upcoming page, count how many distinct chatters are already
 * assigned on the chatter schedule board, plus surface the POD/team labels
 * from the matching Monday group title.
 *
 * Match is case-insensitive substring: a model named "CHINKERBELL" matches
 * any assignment whose page_name (parsed from the group title) equals
 * "CHINKERBELL" — or, if page_name parsing failed, whose group_title
 * contains the model name.
 */
type AssignmentLookup = Record<string, { chatters: Set<string>; pod: string | null; team: string | null }>

async function getAssignmentsByPage(modelNames: string[]): Promise<AssignmentLookup> {
  if (modelNames.length === 0) return {}
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('page_assignments')
    .select('page_name, group_title, chatter_name, pod, team')
  if (error) throw new Error(`getAssignmentsByPage: ${error.message}`)

  const result: AssignmentLookup = {}
  for (const name of modelNames) result[name] = { chatters: new Set(), pod: null, team: null }

  for (const row of (data ?? []) as { page_name: string | null; group_title: string | null; chatter_name: string | null; pod: string | null; team: string | null }[]) {
    const groupTitle = row.group_title?.toUpperCase() ?? null
    if (!groupTitle) continue

    for (const modelName of modelNames) {
      const upper = modelName.toUpperCase().trim()
      if (!upper) continue
      // Groups can hold multiple pages joined by " | " (e.g. "POD C - T6 LACIE OWENS | HENNA").
      // A case-insensitive substring match on the full group title catches both single and
      // combined page groups.
      if (!groupTitle.includes(upper)) continue

      const entry = result[modelName]
      if (row.chatter_name && row.chatter_name.trim()) {
        entry.chatters.add(row.chatter_name.trim())
      }
      if (!entry.pod && row.pod) entry.pod = row.pod
      if (!entry.team && row.team) entry.team = row.team
    }
  }
  return result
}

/**
 * Models still to be onboarded: start_date is today or later.
 * Excludes anything explicitly marked ACTIVE (those are already live).
 */
export async function getUpcomingModels(): Promise<ModelWithCapacity[]> {
  const supabase = createAdminClient()
  const now = new Date()
  const todayIso = isoDay(now)

  const { data, error } = await supabase
    .from('models')
    .select('id, monday_item_id, name, agency, page_type, revenue, start_date, board, ae, status, telegram_group, marketing, group_title')
    .gte('start_date', todayIso)
    .or('status.is.null,status.neq.ACTIVE')
    .order('start_date', { ascending: true })
  if (error) throw new Error(`getUpcomingModels: ${error.message}`)

  const rows = (data ?? []) as Model[]
  const lookup = await getAssignmentsByPage(rows.map(m => m.name))

  return rows.map(m => {
    const chattersNeeded = chattersForRevenue(m.revenue)
    const assignment = lookup[m.name]
    const chattersAlreadyAssigned = assignment ? assignment.chatters.size : 0
    return {
      ...m,
      teamsNeeded: teamsForRevenue(m.revenue),
      chattersNeeded,
      chattersAlreadyAssigned,
      chattersStillNeeded: Math.max(0, chattersNeeded - chattersAlreadyAssigned),
      pod: assignment?.pod ?? null,
      team: assignment?.team ?? null,
      daysUntilStart: daysUntil(m.start_date, now),
    }
  })
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
  totalChattersNeeded: number          // sum across pages, gross — for reference
  totalAlreadyAssigned: number         // already pulled from other pages
  totalStillNeeded: number             // what we actually need to source from standby
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
  const totalAlreadyAssigned = models.reduce((sum, m) => sum + m.chattersAlreadyAssigned, 0)
  const totalStillNeeded = models.reduce((sum, m) => sum + m.chattersStillNeeded, 0)
  const shortBy = Math.max(0, totalStillNeeded - availableStandby)
  return {
    models,
    totalChattersNeeded,
    totalAlreadyAssigned,
    totalStillNeeded,
    availableStandby,
    coverage: shortBy === 0 ? 'covered' : 'short',
    shortBy,
  }
}
