/**
 * Server-side data access for the dashboard.
 * Reads from Supabase candidates table (and friends).
 */

import { createAdminClient } from './supabase/admin'
import { uiBucket, type CanonicalStage, type UiBucket } from './stages'
import { tierRank, type Region } from './candidates'

// Supabase PostgREST caps row responses at 1000 by default — paginate to get the full set.
const PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

async function fetchAllPaged<T>(query: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

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
  scheduled: ['scheduled_interview', 'pending_onboarding', 'pending_week_1'],
  training: ['week_1_training', 'week_2_training', 'week_3_training', 'training_board'],
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
 * Includes offboarded counts as a separate dimension so the UI can surface them.
 * One query, one round-trip.
 */
export async function getDashboardStats() {
  const supabase = createAdminClient()
  const data = await fetchAllPaged<{ region: Region; current_stage: CanonicalStage }>((from, to) =>
    supabase.from('candidates').select('region, current_stage').range(from, to)
  )

  const byRegion: Record<Region, Record<Exclude<UiBucket, null>, number>> = {
    PH: emptyBucket(), EU: emptyBucket(), SA: emptyBucket(), UK: emptyBucket(),
  }
  const offboardedByRegion: Record<Region, number> = { PH: 0, EU: 0, SA: 0, UK: 0 }
  let inPipeline = 0
  let totalAll = 0

  for (const row of data) {
    totalAll += 1
    if (row.current_stage === 'offboarded') {
      offboardedByRegion[row.region] += 1
      continue
    }
    const bucket = uiBucket(row.current_stage)
    if (!bucket) continue
    byRegion[row.region][bucket] += 1
    // Active chatters are hired + working — no longer in pipeline.
    if (bucket !== 'active') inPipeline += 1
  }

  const sumBucket = (b: Exclude<UiBucket, null>) =>
    byRegion.PH[b] + byRegion.EU[b] + byRegion.SA[b] + byRegion.UK[b]

  const offboardedTotal = offboardedByRegion.PH + offboardedByRegion.EU + offboardedByRegion.SA + offboardedByRegion.UK

  return {
    total: inPipeline,
    inPipeline,
    interviews: sumBucket('pending') + sumBucket('scheduled'),
    inTraining: sumBucket('training'),
    activeHires: sumBucket('active'),
    typeforms: sumBucket('typeform'),
    passed: sumBucket('passed'),
    standby: sumBucket('standby'),
    offboardedTotal,
    totalAll,
    byRegion,
    offboardedByRegion,
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

export type ManagerSummary = {
  name: string
  total: number
  inPipeline: number
  t1: number
  t2: number
  t3: number
  t4: number
  ungraded: number
}

export type GroupSummary = {
  groupTitle: string
  count: number
  bucket: UiBucket
  stage: CanonicalStage
}

export async function getRegionStats(region: Region) {
  const supabase = createAdminClient()
  type Row = { current_stage: CanonicalStage; current_group_title: string | null; tier: string | null; assigned_manager: string | null }
  const data = await fetchAllPaged<Row>((from, to) =>
    supabase.from('candidates')
      .select('current_stage, current_group_title, tier, assigned_manager')
      .eq('region', region)
      .range(from, to)
  )

  const byStage: Partial<Record<CanonicalStage, number>> = {}
  const byBucket: Record<Exclude<UiBucket, null>, number> = emptyBucket()
  const tierDist: Record<string, number> = {}
  const groupAcc: Record<string, GroupSummary> = {}
  const managerAcc: Record<string, ManagerSummary> = {}
  let inPipeline = 0
  let total = 0

  for (const row of data) {
    total += 1
    byStage[row.current_stage] = (byStage[row.current_stage] ?? 0) + 1
    const bucket = uiBucket(row.current_stage)
    if (bucket) {
      byBucket[bucket] += 1
      // Active chatters are hired + working — no longer in pipeline.
      if (bucket !== 'active') inPipeline += 1
    }
    if (row.tier) {
      tierDist[row.tier] = (tierDist[row.tier] ?? 0) + 1
    }

    // Sub-stage breakdown — real Monday group titles
    if (row.current_group_title) {
      const g = groupAcc[row.current_group_title]
      if (g) g.count += 1
      else groupAcc[row.current_group_title] = { groupTitle: row.current_group_title, count: 1, bucket, stage: row.current_stage }
    }

    // Per-manager breakdown — only candidates still in pipeline
    if (bucket) {
      const mgrName = row.assigned_manager?.trim() || 'Unassigned'
      if (!managerAcc[mgrName]) {
        managerAcc[mgrName] = { name: mgrName, total: 0, inPipeline: 0, t1: 0, t2: 0, t3: 0, t4: 0, ungraded: 0 }
      }
      const m = managerAcc[mgrName]
      m.total += 1
      m.inPipeline += 1
      const rank = tierRank(row.tier)
      if (rank === 1) m.t1 += 1
      else if (rank === 2) m.t2 += 1
      else if (rank === 3) m.t3 += 1
      else if (rank === 4) m.t4 += 1
      else m.ungraded += 1
    }
  }

  const byGroup: GroupSummary[] = Object.values(groupAcc).sort((a, b) => b.count - a.count)
  const byManager: ManagerSummary[] = Object.values(managerAcc).sort((a, b) => b.inPipeline - a.inPipeline)

  return { total, inPipeline, byStage, byBucket, tierDist, byGroup, byManager }
}

export type BriefingCandidate = {
  id: string
  name: string
  region: Region
  tier: string | null
  current_stage: CanonicalStage
  current_group_title: string | null
  assigned_manager: string | null
}

export type BriefingData = {
  newLast24h: number
  interviews: number
  atRiskTotal: number
  topTierTotal: number
  transitions24h: number
  atRiskInTraining: BriefingCandidate[]
  topTier: BriefingCandidate[]
}

/**
 * Everything the morning briefing needs — derived entirely from synced data.
 */
export async function getBriefingData(): Promise<BriefingData> {
  const supabase = createAdminClient()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  type Row = BriefingCandidate & { monday_created_at: string | null }
  const data = await fetchAllPaged<Row>((from, to) =>
    supabase.from('candidates')
      .select('id, name, region, tier, current_stage, current_group_title, assigned_manager, monday_created_at')
      .neq('current_stage', 'offboarded')
      .range(from, to)
  )

  let newLast24h = 0
  let interviews = 0
  let atRiskTotal = 0
  let topTierTotal = 0
  const atRiskInTraining: BriefingCandidate[] = []
  const topTier: BriefingCandidate[] = []

  for (const row of data) {
    if (row.monday_created_at && row.monday_created_at >= since24h) newLast24h += 1

    const bucket = uiBucket(row.current_stage)
    if (bucket === 'pending' || bucket === 'scheduled') interviews += 1

    const rank = tierRank(row.tier)
    if (rank !== null && rank <= 2) {
      atRiskTotal += 1
      if (bucket === 'training') atRiskInTraining.push(stripCreated(row))
    } else if (rank !== null && rank >= 3) {
      topTierTotal += 1
      if (rank >= 4) topTier.push(stripCreated(row))
    }
  }

  const { count: transitions24h } = await supabase
    .from('stage_transitions')
    .select('id', { count: 'exact', head: true })
    .gte('detected_at', since24h)

  return {
    newLast24h,
    interviews,
    atRiskTotal,
    topTierTotal,
    transitions24h: transitions24h ?? 0,
    atRiskInTraining: atRiskInTraining.slice(0, 12),
    topTier: topTier.slice(0, 12),
  }
}

function stripCreated(row: BriefingCandidate & { monday_created_at?: string | null }): BriefingCandidate {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    tier: row.tier,
    current_stage: row.current_stage,
    current_group_title: row.current_group_title,
    assigned_manager: row.assigned_manager,
  }
}

export type Alert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  type:
    | 'weak_in_advanced_training'
    | 'weak_in_early_training'
    | 'idle_early_stage'
    | 'long_idle'
    | 'new_top_tier'
    | 'stage_bottleneck'
    | 'standby_unassigned'
    | 'pto_overdue'
  title: string
  meta: string
  region: Region
  candidateId?: string
  candidateName?: string
}

/**
 * Compute open alerts from the current candidate state.
 * No persistence — rederived on each dashboard load.
 */
export async function getCurrentAlerts(): Promise<Alert[]> {
  const supabase = createAdminClient()
  type Row = {
    id: string; name: string; region: Region; tier: string | null;
    current_stage: CanonicalStage; current_group_title: string | null;
    assigned_manager: string | null;
    monday_updated_at: string | null; monday_created_at: string | null;
    page_assignment: string | null; board_assignment: string | null;
    current_stage_entered_at: string | null;
  }
  const data = await fetchAllPaged<Row>((from, to) =>
    supabase.from('candidates')
      .select('id, name, region, tier, current_stage, current_group_title, assigned_manager, monday_updated_at, monday_created_at, page_assignment, board_assignment, current_stage_entered_at')
      .neq('current_stage', 'offboarded')
      .range(from, to)
  )

  const now = Date.now()
  const since24h = now - 24 * 60 * 60 * 1000
  const veryRecent = now - 7 * 24 * 60 * 60 * 1000   // touched in last 7 days = actively in motion
  const alerts: Alert[] = []

  // Per-region bucket counters for bottleneck detection
  const bucketCounts: Record<Region, Record<Exclude<UiBucket, null>, number>> = {
    PH: emptyBucket(), EU: emptyBucket(), SA: emptyBucket(), UK: emptyBucket(),
  }

  for (const c of data) {
    const bucket = uiBucket(c.current_stage)
    if (bucket) bucketCounts[c.region][bucket] += 1

    const rank = tierRank(c.tier)
    const updated = c.monday_updated_at ? new Date(c.monday_updated_at).getTime() : 0
    const created = c.monday_created_at ? new Date(c.monday_created_at).getTime() : 0
    const daysIdle = updated ? Math.floor((now - updated) / 86_400_000) : 999
    const stageLabel = c.current_group_title ?? c.current_stage.replace(/_/g, ' ')
    const mgr = c.assigned_manager ? ` · ${c.assigned_manager}` : ''

    const recentlyActive = updated >= veryRecent

    // Weak tier (T1/T2) in advanced training stages, touched in last 7d = critical
    if (recentlyActive && rank !== null && rank <= 2 && ['week_2_training', 'week_3_training', 'training_board'].includes(c.current_stage)) {
      alerts.push({
        id: `weak_adv:${c.id}`,
        severity: 'critical',
        type: 'weak_in_advanced_training',
        title: `${c.name} · Tier ${rank} in ${stageLabel}`,
        meta: `${c.region}${mgr} — likely struggling, decide invest vs offboard`,
        region: c.region, candidateId: c.id, candidateName: c.name,
      })
    }
    // Weak tier in early training, recently active = warning
    else if (recentlyActive && rank !== null && rank <= 2 && ['week_1_training', 'pending_week_1'].includes(c.current_stage)) {
      alerts.push({
        id: `weak_early:${c.id}`,
        severity: 'warning',
        type: 'weak_in_early_training',
        title: `${c.name} · Tier ${rank} in ${stageLabel}`,
        meta: `${c.region}${mgr} — watch this week`,
        region: c.region, candidateId: c.id, candidateName: c.name,
      })
    }

    // Idle in early stage
    const earlyStages: CanonicalStage[] = ['typeform', 'passed_typeform', 'pending_interview', 'scheduled_interview', 'pending_onboarding']
    if (earlyStages.includes(c.current_stage) && daysIdle >= 10) {
      const sev: Alert['severity'] = daysIdle >= 21 ? 'critical' : 'warning'
      alerts.push({
        id: `idle:${c.id}`,
        severity: sev,
        type: daysIdle >= 21 ? 'long_idle' : 'idle_early_stage',
        title: `${c.name} · idle ${daysIdle} days in ${stageLabel}`,
        meta: `${c.region}${mgr} — chase, schedule, or close`,
        region: c.region, candidateId: c.id, candidateName: c.name,
      })
    }

    // Standby SLA — chatter in standby with no BOARD assigned
    if (c.current_stage === 'standby') {
      const enteredAt = c.current_stage_entered_at ? new Date(c.current_stage_entered_at).getTime() : updated
      const hoursIn = Math.max(0, Math.floor((now - enteredAt) / 3_600_000))
      const noBoard = !c.board_assignment || c.board_assignment.trim() === ''
      if (noBoard && hoursIn >= 24) {
        const sev: Alert['severity'] = hoursIn >= 48 ? 'critical' : 'warning'
        const pageNote = c.page_assignment ? `on page ${c.page_assignment}` : 'no page either'
        alerts.push({
          id: `standby_unassigned:${c.id}`,
          severity: sev,
          type: 'standby_unassigned',
          title: `${c.name} · ${hoursIn}h in standby, no BOARD assigned`,
          meta: `${c.region}${mgr} · ${pageNote} — ${sev === 'critical' ? 'losing them, assign now' : 'assign within 24h'}`,
          region: c.region, candidateId: c.id, candidateName: c.name,
        })
      }
    }

    // PTO 2-week rule
    if (c.current_stage === 'pto') {
      const enteredAt = c.current_stage_entered_at ? new Date(c.current_stage_entered_at).getTime() : updated
      const daysIn = Math.max(0, Math.floor((now - enteredAt) / 86_400_000))
      if (daysIn >= 14) {
        alerts.push({
          id: `pto_overdue:${c.id}`,
          severity: 'critical',
          type: 'pto_overdue',
          title: `${c.name} · ${daysIn} days in Personal Time Off`,
          meta: `${c.region}${mgr} — 2 weeks reached, time to let go`,
          region: c.region, candidateId: c.id, candidateName: c.name,
        })
      }
    }

    // New Tier 4 in last 24h = info spotlight
    if (rank === 4 && created >= since24h) {
      alerts.push({
        id: `new_top:${c.id}`,
        severity: 'info',
        type: 'new_top_tier',
        title: `${c.name} just arrived as Tier 4`,
        meta: `${c.region}${mgr} — fast-track candidate`,
        region: c.region, candidateId: c.id, candidateName: c.name,
      })
    }
  }

  // Region-level bottleneck detection (pending_interview > 6 per region = warning)
  for (const region of ['PH', 'EU', 'SA', 'UK'] as Region[]) {
    const pending = bucketCounts[region].pending
    if (pending >= 6) {
      alerts.push({
        id: `bottleneck_pending:${region}`,
        severity: pending >= 12 ? 'critical' : 'warning',
        type: 'stage_bottleneck',
        title: `${region}: ${pending} candidates pending interview`,
        meta: 'Bottleneck — schedule or pass',
        region,
      })
    }
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return alerts.slice(0, 80)
}

export type StaleCandidate = {
  id: string
  name: string
  tier: string | null
  current_stage: CanonicalStage
  current_group_title: string | null
  assigned_manager: string | null
  monday_updated_at: string | null
  daysSinceUpdate: number
}

/**
 * Candidates in early/active stages whose Monday item hasn't been touched
 * for `daysThreshold`+ days. Skips standby/active stages where staleness
 * is expected. Uses monday_updated_at as the staleness signal.
 */
export async function getStaleCandidates(region: Region, daysThreshold = 5, limit = 15): Promise<StaleCandidate[]> {
  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - daysThreshold * 86_400_000).toISOString()
  const stages: CanonicalStage[] = [
    'typeform', 'passed_typeform',
    'pending_interview', 'scheduled_interview', 'pending_onboarding',
    'pending_week_1', 'week_1_training', 'week_2_training', 'week_3_training', 'training_board',
  ]
  const { data, error } = await supabase
    .from('candidates')
    .select('id, name, tier, current_stage, current_group_title, assigned_manager, monday_updated_at')
    .eq('region', region)
    .in('current_stage', stages)
    .lt('monday_updated_at', cutoff)
    .order('monday_updated_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw new Error(`getStaleCandidates: ${error.message}`)
  const now = Date.now()
  return (data ?? []).map((r) => {
    const row = r as { id: string; name: string; tier: string | null; current_stage: CanonicalStage; current_group_title: string | null; assigned_manager: string | null; monday_updated_at: string | null }
    const days = row.monday_updated_at ? Math.floor((now - new Date(row.monday_updated_at).getTime()) / 86_400_000) : 999
    return { ...row, daysSinceUpdate: days }
  })
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
