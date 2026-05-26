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
 * Models we're onboarding next. Excludes anything explicitly marked ACTIVE
 * (already live). Models with no start date are kept but float to the bottom.
 * Sub-$40k pages are still listed (user wants to see them) but show 0 teams.
 */
export async function getUpcomingModels(): Promise<ModelWithCapacity[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('models')
    .select('id, monday_item_id, name, agency, page_type, revenue, start_date, board, ae, status, telegram_group, marketing, group_title')
    .or('status.is.null,status.neq.ACTIVE')
    .order('start_date', { ascending: true, nullsFirst: false })
    .limit(200)
  if (error) throw new Error(`getUpcomingModels: ${error.message}`)

  const now = new Date()
  return (data ?? []).map(m => ({
    ...(m as Model),
    teamsNeeded: teamsForRevenue(m.revenue),
    chattersNeeded: chattersForRevenue(m.revenue),
    daysUntilStart: daysUntil(m.start_date, now),
  }))
}

/**
 * Global standby supply: chatters in standby/pool with no board assignment.
 * That's the set of people we could route onto a newly onboarded page.
 */
export async function getAvailableStandbyCount(): Promise<number> {
  const supabase = createAdminClient()
  // PostgREST: in() for stage filter, or() for "board IS NULL OR board = ''".
  const { count, error } = await supabase
    .from('candidates')
    .select('id', { count: 'exact', head: true })
    .in('current_stage', ['standby', 'pool'])
    .or('board_assignment.is.null,board_assignment.eq.')
  if (error) throw new Error(`getAvailableStandbyCount: ${error.message}`)
  return count ?? 0
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
