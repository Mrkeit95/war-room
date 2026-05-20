/**
 * Server-side data access for the dashboard.
 * Reads from Supabase candidates table (and friends).
 */

import { createAdminClient } from './supabase/admin'
import { uiBucket, type CanonicalStage, type UiBucket } from './stages'
import type { Region } from './candidates'

export type DbCandidate = {
  id: string
  monday_item_id: string
  region: Region
  name: string
  current_stage: CanonicalStage
  current_group_title: string | null
  current_status: string | null
  tier: string | null
  track: 'exp' | 'non_exp' | null
  assigned_manager: string | null
  telegram: string | null
  phone: string | null
  email: string | null
  country: string | null
  source: string | null
  monday_created_at: string | null
  monday_updated_at: string | null
  first_seen_at: string
  last_synced_at: string
}

const CANDIDATE_SELECT = 'id, monday_item_id, region, name, current_stage, current_group_title, current_status, tier, track, assigned_manager, telegram, phone, email, country, source, monday_created_at, monday_updated_at, first_seen_at, last_synced_at'

const STAGES_BY_BUCKET: Record<Exclude<UiBucket, null>, CanonicalStage[]> = {
  typeform: ['typeform'],
  passed: ['passed_typeform'],
  pending: ['pending_interview'],
  scheduled: ['scheduled_interview', 'pending_onboarding'],
  training: ['pending_week_1', 'week_1_training', 'week_2_training', 'week_3_training', 'training_board'],
  standby: ['pool', 'standby'],
  active: ['active', 'promoted', 'pto'],
}

export const IN_PIPELINE_STAGES: CanonicalStage[] = Object.values(STAGES_BY_BUCKET).flat()

export function stagesForBucket(bucket: UiBucket): CanonicalStage[] {
  if (!bucket) return []
  return STAGES_BY_BUCKET[bucket] ?? []
}

/**
 * Returns an aggregate snapshot keyed by region and ui bucket, plus totals.
 * One query, one round-trip.
 */
export async function getDashboardStats() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('candidates')
    .select('region, current_stage')
    .neq('current_stage', 'offboarded')
    .limit(10000)
  if (error) throw new Error(`getDashboardStats: ${error.message}`)

  const byRegion: Record<Region, Record<Exclude<UiBucket, null>, number>> = {
    PH: emptyBucket(), EU: emptyBucket(), SA: emptyBucket(), UK: emptyBucket(),
  }
  let total = 0
  for (const row of (data ?? []) as { region: Region; current_stage: CanonicalStage }[]) {
    const bucket = uiBucket(row.current_stage)
    if (!bucket) continue
    byRegion[row.region][bucket] += 1
    total += 1
  }

  const sumBucket = (b: Exclude<UiBucket, null>) =>
    byRegion.PH[b] + byRegion.EU[b] + byRegion.SA[b] + byRegion.UK[b]

  return {
    total,
    inPipeline: total,
    interviews: sumBucket('pending') + sumBucket('scheduled'),
    inTraining: sumBucket('training'),
    activeHires: sumBucket('active'),
    typeforms: sumBucket('typeform'),
    passed: sumBucket('passed'),
    standby: sumBucket('standby'),
    byRegion,
  }
}

function emptyBucket(): Record<Exclude<UiBucket, null>, number> {
  return { typeform: 0, passed: 0, pending: 0, scheduled: 0, training: 0, standby: 0, active: 0 }
}

export async function getCandidateById(id: string): Promise<DbCandidate | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('candidates')
    .select(CANDIDATE_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getCandidateById: ${error.message}`)
  return (data as DbCandidate | null) ?? null
}

type ListOpts = {
  region?: Region
  bucket?: UiBucket
  stages?: CanonicalStage[]
  limit?: number
  excludeOffboarded?: boolean
}

export async function listCandidates(opts: ListOpts = {}): Promise<DbCandidate[]> {
  const supabase = createAdminClient()
  let query = supabase.from('candidates').select(CANDIDATE_SELECT)

  if (opts.region) query = query.eq('region', opts.region)

  let stageFilter: CanonicalStage[] | null = opts.stages ?? null
  if (!stageFilter && opts.bucket) {
    stageFilter = stagesForBucket(opts.bucket)
  }
  if (stageFilter && stageFilter.length > 0) {
    query = query.in('current_stage', stageFilter)
  } else if (opts.excludeOffboarded !== false) {
    query = query.neq('current_stage', 'offboarded')
  }

  query = query.order('monday_updated_at', { ascending: false, nullsFirst: false })
  query = query.limit(opts.limit ?? 100)

  const { data, error } = await query
  if (error) throw new Error(`listCandidates: ${error.message}`)
  return (data ?? []) as DbCandidate[]
}

export async function getRegionStats(region: Region) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('candidates')
    .select('current_stage, tier')
    .eq('region', region)
    .limit(10000)
  if (error) throw new Error(`getRegionStats: ${error.message}`)

  const byStage: Partial<Record<CanonicalStage, number>> = {}
  const byBucket: Record<Exclude<UiBucket, null>, number> = emptyBucket()
  const gradeDist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  let inPipeline = 0
  let total = 0

  for (const row of (data ?? []) as { current_stage: CanonicalStage; tier: string | null }[]) {
    total += 1
    byStage[row.current_stage] = (byStage[row.current_stage] ?? 0) + 1
    const bucket = uiBucket(row.current_stage)
    if (bucket) {
      byBucket[bucket] += 1
      inPipeline += 1
    }
    if (row.tier) {
      const upper = row.tier.toUpperCase()
      if (upper in gradeDist) gradeDist[upper] += 1
    }
  }

  return { total, inPipeline, byStage, byBucket, gradeDist }
}

export async function getLastSyncedAt(): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('sync_runs')
    .select('finished_at')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.finished_at as string | null) ?? null
}
