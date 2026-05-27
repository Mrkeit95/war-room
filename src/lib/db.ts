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

// ---------------------------------------------------------------------------
// Department + movements signals for the morning briefing
// ---------------------------------------------------------------------------

export type DepartmentMovement = {
  region: Region
  inPipeline: number
  newLast24h: number
  transitions24h: number
  enteredTraining24h: number
  enteredStandby24h: number
  enteredActive24h: number
  offboarded24h: number
}

const REGIONS: Region[] = ['PH', 'EU', 'SA', 'UK']

export async function getDepartmentMovements(): Promise<DepartmentMovement[]> {
  const supabase = createAdminClient()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // 1. Per-region pipeline size + new-in-24h counts.
  type CandRow = { region: Region; current_stage: CanonicalStage; monday_created_at: string | null }
  const candidates = await fetchAllPaged<CandRow>((from, to) =>
    supabase.from('candidates')
      .select('region, current_stage, monday_created_at')
      .range(from, to),
  )

  const acc: Record<Region, DepartmentMovement> = {
    PH: { region: 'PH', inPipeline: 0, newLast24h: 0, transitions24h: 0, enteredTraining24h: 0, enteredStandby24h: 0, enteredActive24h: 0, offboarded24h: 0 },
    EU: { region: 'EU', inPipeline: 0, newLast24h: 0, transitions24h: 0, enteredTraining24h: 0, enteredStandby24h: 0, enteredActive24h: 0, offboarded24h: 0 },
    SA: { region: 'SA', inPipeline: 0, newLast24h: 0, transitions24h: 0, enteredTraining24h: 0, enteredStandby24h: 0, enteredActive24h: 0, offboarded24h: 0 },
    UK: { region: 'UK', inPipeline: 0, newLast24h: 0, transitions24h: 0, enteredTraining24h: 0, enteredStandby24h: 0, enteredActive24h: 0, offboarded24h: 0 },
  }

  for (const c of candidates) {
    if (!REGIONS.includes(c.region)) continue
    // "In pipeline" excludes hires/promoted/PTO (active bucket). PH additionally
    // excludes standby + pool because that pool is cross-region — surfacing
    // it under PH inflates the headcount with chatters serving other regions.
    const bucket = uiBucket(c.current_stage)
    const isActive = bucket === 'active'
    const isStandbyPool = bucket === 'standby'
    const exclude = c.current_stage === 'offboarded'
      || isActive
      || (c.region === 'PH' && isStandbyPool)
    if (!exclude) acc[c.region].inPipeline += 1
    if (c.monday_created_at && c.monday_created_at >= since24h) acc[c.region].newLast24h += 1
  }

  // 2. Stage transitions in last 24h, joined to candidates for region.
  const { data: transitionsRaw, error: tErr } = await supabase
    .from('stage_transitions')
    .select('to_stage, candidates!inner(region)')
    .gte('detected_at', since24h)
  if (tErr) throw new Error(`getDepartmentMovements (transitions): ${tErr.message}`)

  for (const row of (transitionsRaw ?? []) as { to_stage: CanonicalStage; candidates: { region: Region } | { region: Region }[] }[]) {
    // PostgREST returns the join as an object for one-to-one (FK) — defensively unwrap if it's an array.
    const cand = Array.isArray(row.candidates) ? row.candidates[0] : row.candidates
    if (!cand || !REGIONS.includes(cand.region)) continue
    acc[cand.region].transitions24h += 1
    if (row.to_stage === 'offboarded') acc[cand.region].offboarded24h += 1
    const b = uiBucket(row.to_stage)
    if (b === 'training') acc[cand.region].enteredTraining24h += 1
    else if (b === 'standby') acc[cand.region].enteredStandby24h += 1
    else if (b === 'active') acc[cand.region].enteredActive24h += 1
  }

  return REGIONS.map(r => acc[r])
}

export type StageDelta = {
  region: Region
  stage: CanonicalStage
  groupTitle: string                // pretty label for display ("WEEK 1 TRAINING")
  yesterdayCount: number
  todayCount: number
  delta: number                     // today - yesterday
  // What actually moved in / out of this stage in the last 24h. Net delta and
  // gross movement may differ when people both enter and leave the same stage.
  leftStage: { name: string; toStage: CanonicalStage }[]
  enteredStage: { name: string; fromStage: CanonicalStage | null }[]
}

const PRETTY_STAGE: Record<CanonicalStage, string> = {
  typeform: 'Typeform',
  passed_typeform: 'Passed typeform',
  pending_interview: 'Pending interview',
  scheduled_interview: 'Scheduled interview',
  pending_onboarding: 'Pending onboarding',
  pending_week_1: 'Pending Week 1',
  week_1_training: 'Week 1 training',
  week_2_training: 'Week 2 training',
  week_3_training: 'Week 3-4 training',
  training_board: 'Training board',
  pool: 'Pool (after week 2)',
  standby: 'Standby',
  active: 'Active',
  promoted: 'Promoted',
  pto: 'PTO',
  offboarded: 'Offboarded',
}

/**
 * Per-(region, stage) change between yesterday's snapshot and today's. Only
 * returns stages where the count actually moved (|delta| >= minDelta). The
 * sync writes a fresh snapshot every run so "today" is the latest known count.
 */
export async function getStageDeltas(minDelta = 1): Promise<StageDelta[]> {
  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  type Row = { region: Region; stage: CanonicalStage; candidate_count: number }
  const [todayRes, yesterdayRes, transRes] = await Promise.all([
    supabase.from('pipeline_snapshots').select('region, stage, candidate_count').eq('snapshot_date', today),
    supabase.from('pipeline_snapshots').select('region, stage, candidate_count').eq('snapshot_date', yesterday),
    supabase.from('stage_transitions')
      .select('from_stage, to_stage, candidates!inner(name, region)')
      .gte('detected_at', since24h),
  ])
  const todayRows = (todayRes.data ?? []) as Row[]
  const yesterdayRows = (yesterdayRes.data ?? []) as Row[]

  const yMap = new Map<string, number>()
  for (const r of yesterdayRows) yMap.set(`${r.region}|${r.stage}`, r.candidate_count)
  const tMap = new Map<string, number>()
  for (const r of todayRows) tMap.set(`${r.region}|${r.stage}`, r.candidate_count)

  // Group transitions by (region, stage) for the leftStage / enteredStage lists.
  const leftMap = new Map<string, { name: string; toStage: CanonicalStage }[]>()
  const enteredMap = new Map<string, { name: string; fromStage: CanonicalStage | null }[]>()
  for (const row of (transRes.data ?? []) as { from_stage: CanonicalStage | null; to_stage: CanonicalStage; candidates: { name: string; region: Region } | { name: string; region: Region }[] }[]) {
    const cand = Array.isArray(row.candidates) ? row.candidates[0] : row.candidates
    if (!cand?.region) continue
    if (row.from_stage) {
      const k = `${cand.region}|${row.from_stage}`
      const arr = leftMap.get(k) ?? []
      arr.push({ name: cand.name, toStage: row.to_stage })
      leftMap.set(k, arr)
    }
    const k = `${cand.region}|${row.to_stage}`
    const arr = enteredMap.get(k) ?? []
    arr.push({ name: cand.name, fromStage: row.from_stage })
    enteredMap.set(k, arr)
  }

  const keys = new Set<string>([...yMap.keys(), ...tMap.keys(), ...leftMap.keys(), ...enteredMap.keys()])
  const deltas: StageDelta[] = []
  for (const k of keys) {
    const [region, stage] = k.split('|') as [Region, CanonicalStage]
    const todayCount = tMap.get(k) ?? 0
    const yesterdayCount = yMap.get(k) ?? 0
    const delta = todayCount - yesterdayCount
    const left = leftMap.get(k) ?? []
    const entered = enteredMap.get(k) ?? []
    // Surface anything with a count delta OR any actual transitions in/out — even if net is 0.
    if (Math.abs(delta) < minDelta && left.length === 0 && entered.length === 0) continue
    deltas.push({
      region, stage,
      groupTitle: PRETTY_STAGE[stage] ?? stage,
      yesterdayCount, todayCount, delta,
      leftStage: left,
      enteredStage: entered,
    })
  }
  deltas.sort((a, b) => {
    const abs = Math.abs(b.delta) - Math.abs(a.delta)
    if (abs !== 0) return abs
    return a.delta - b.delta
  })
  return deltas
}

export type RecentMovement = {
  id: string
  candidateId: string
  candidateName: string
  region: Region
  fromStage: CanonicalStage | null
  toStage: CanonicalStage
  detectedAt: string
}

export type ManagerActivity = {
  name: string
  displayName: string
  role: string
  candidatesAssigned: number
  newLast24h: number
  transitions24h: number
  enteredTraining24h: number
  enteredStandby24h: number
  enteredActive24h: number
  offboarded24h: number
  // Concrete names for each bucket so the briefing reads like a report, not a count
  newCandidateNames: string[]
  enteredTrainingNames: string[]
  enteredStandbyNames: string[]
  enteredActiveNames: string[]
  offboardedNames: string[]
}

// Configured roster: the people we care about reporting on. Anyone outside this
// list isn't surfaced even if they appear in assigned_manager.
type RosterEntry = { monManager: string; displayName: string; role: string; sortGroup: number; excludeFromBriefing?: boolean }

function getManagerRoster(): RosterEntry[] {
  return [
    // Hiring / recruiting
    { monManager: 'Pauline', displayName: 'Pauline', role: 'PH Recruiting', sortGroup: 0 },
    { monManager: 'Daireen Mae Dagatan', displayName: 'Daireen Mae Dagatan', role: 'PH Recruiting', sortGroup: 0 },
    { monManager: 'apple baez', displayName: 'Apple Baez', role: 'PH Recruiting', sortGroup: 0 },
    // PH section leads
    { monManager: 'Andrei Angelo Cando', displayName: 'Andrei Angelo Cando', role: 'PH · Week 1', sortGroup: 1 },
    { monManager: 'Jose Manuel Galan', displayName: 'Jose Manuel Galan', role: 'PH · Week 1', sortGroup: 1 },
    { monManager: 'Arjay Labado', displayName: 'Arjay Labado', role: 'PH · Week 2 / TB', sortGroup: 1 },
    { monManager: 'Pamela Amuro Miña', displayName: 'Pamela Amuro Miña', role: 'PH · Week 2 / TB', sortGroup: 1 },
    { monManager: 'Prince Ellesor Torres', displayName: 'Prince Ellesor Torres', role: 'PH · Week 3-4 / TB', sortGroup: 1 },
    { monManager: 'Gwyneth Fuentes', displayName: 'Gwyneth Fuentes', role: 'PH · Week 3-4 / TB', sortGroup: 1 },
    // Training head
    { monManager: 'Allyson Sam', displayName: 'Allyson Sam', role: 'Head of Training', sortGroup: 2 },
    // AEs — kept in the roster for board mapping, hidden from the briefing per operator preference
    { monManager: 'Day Quintero', displayName: 'Day Quintero', role: 'AE · BOARD 1', sortGroup: 3, excludeFromBriefing: true },
    { monManager: 'Angie Toro', displayName: 'Angie Toro', role: 'AE · BOARD 2', sortGroup: 3, excludeFromBriefing: true },
    { monManager: 'Iori Vukotic', displayName: 'Iori Vukotic', role: 'AE · BOARD 3', sortGroup: 3, excludeFromBriefing: true },
    // Regional heads
    { monManager: 'Aleksandar Simic', displayName: 'Aleksandar Simic', role: 'EU Head', sortGroup: 4 },
    { monManager: 'JUAN SEBASTIAN GONZALEZ PEREZ', displayName: 'Juan Sebastian Gonzalez Perez', role: 'SA Head', sortGroup: 4 },
    { monManager: 'noah whall', displayName: 'Noah Whall', role: 'UK Head', sortGroup: 4 },
  ]
}

export async function getManagerActivity(): Promise<ManagerActivity[]> {
  const supabase = createAdminClient()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const roster = getManagerRoster()

  // Quick lookup from any-cased Monday manager string → roster entry.
  const lookup = new Map<string, RosterEntry>()
  for (const r of roster) lookup.set(r.monManager.toLowerCase(), r)

  // Initialise per-manager accumulator.
  const acc = new Map<string, ManagerActivity>()
  for (const r of roster) {
    if (r.excludeFromBriefing) continue
    acc.set(r.monManager, {
      name: r.monManager,
      displayName: r.displayName,
      role: r.role,
      candidatesAssigned: 0,
      newLast24h: 0,
      transitions24h: 0,
      enteredTraining24h: 0,
      enteredStandby24h: 0,
      enteredActive24h: 0,
      offboarded24h: 0,
      newCandidateNames: [],
      enteredTrainingNames: [],
      enteredStandbyNames: [],
      enteredActiveNames: [],
      offboardedNames: [],
    })
  }

  // 1. Current assignments + new-in-24h, with the new candidates' names.
  type Cand = { name: string; assigned_manager: string | null; current_stage: CanonicalStage; monday_created_at: string | null }
  const cands = await fetchAllPaged<Cand>((from, to) =>
    supabase.from('candidates')
      .select('name, assigned_manager, current_stage, monday_created_at')
      .neq('current_stage', 'offboarded')
      .range(from, to),
  )
  for (const c of cands) {
    if (!c.assigned_manager) continue
    const r = lookup.get(c.assigned_manager.toLowerCase())
    if (!r || r.excludeFromBriefing) continue
    const entry = acc.get(r.monManager)
    if (!entry) continue
    entry.candidatesAssigned += 1
    if (c.monday_created_at && c.monday_created_at >= since24h) {
      entry.newLast24h += 1
      entry.newCandidateNames.push(c.name)
    }
  }

  // 2. 24h transitions joined to candidates — capture names along with counts.
  const { data: transRaw, error: tErr } = await supabase
    .from('stage_transitions')
    .select('to_stage, candidates!inner(name, assigned_manager)')
    .gte('detected_at', since24h)
  if (tErr) throw new Error(`getManagerActivity (transitions): ${tErr.message}`)
  for (const row of (transRaw ?? []) as { to_stage: CanonicalStage; candidates: { name: string; assigned_manager: string | null } | { name: string; assigned_manager: string | null }[] }[]) {
    const cand = Array.isArray(row.candidates) ? row.candidates[0] : row.candidates
    if (!cand?.assigned_manager) continue
    const r = lookup.get(cand.assigned_manager.toLowerCase())
    if (!r || r.excludeFromBriefing) continue
    const entry = acc.get(r.monManager)
    if (!entry) continue
    entry.transitions24h += 1
    if (row.to_stage === 'offboarded') {
      entry.offboarded24h += 1
      entry.offboardedNames.push(cand.name)
    }
    const b = uiBucket(row.to_stage)
    if (b === 'training') {
      entry.enteredTraining24h += 1
      entry.enteredTrainingNames.push(cand.name)
    } else if (b === 'standby') {
      entry.enteredStandby24h += 1
      entry.enteredStandbyNames.push(cand.name)
    } else if (b === 'active') {
      entry.enteredActive24h += 1
      entry.enteredActiveNames.push(cand.name)
    }
  }

  // Sort: active (most transitions) first within group, then by sortGroup
  const rosterByName = new Map(roster.map(r => [r.monManager, r] as const))
  return [...acc.values()].sort((a, b) => {
    const ga = rosterByName.get(a.name)?.sortGroup ?? 99
    const gb = rosterByName.get(b.name)?.sortGroup ?? 99
    if (ga !== gb) return ga - gb
    if (b.transitions24h !== a.transitions24h) return b.transitions24h - a.transitions24h
    return a.displayName.localeCompare(b.displayName)
  })
}

export async function getRecentMovements(limit = 12): Promise<RecentMovement[]> {
  const supabase = createAdminClient()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('stage_transitions')
    .select('id, from_stage, to_stage, detected_at, candidates!inner(id, name, region)')
    .gte('detected_at', since24h)
    .order('detected_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`getRecentMovements: ${error.message}`)

  return ((data ?? []) as { id: string; from_stage: CanonicalStage | null; to_stage: CanonicalStage; detected_at: string; candidates: { id: string; name: string; region: Region } | { id: string; name: string; region: Region }[] }[])
    .map(r => {
      const cand = Array.isArray(r.candidates) ? r.candidates[0] : r.candidates
      return {
        id: r.id,
        candidateId: cand.id,
        candidateName: cand.name,
        region: cand.region,
        fromStage: r.from_stage,
        toStage: r.to_stage,
        detectedAt: r.detected_at,
      }
    })
    .filter(r => REGIONS.includes(r.region))
}

// ---------------------------------------------------------------------------
// Revenue dashboard (rev tracker)
// ---------------------------------------------------------------------------

export type BoardSummaryRow = {
  boardName: string                    // "BOARD 1" ... "TOWER", or "TOTALS"
  runningSales: number | null
  projection: number | null
  goal: number | null
  activeCount: number | null
  upCount: number | null
  downCount: number | null
  ratio: number | null
  subsPct: number | null
  momPct: number | null
  pctToGoal: number | null
  subRevenue: number | null
  pageCount: number                    // counted from page_board_map
}

const BOARD_DISPLAY_ORDER = ['BOARD 1', 'BOARD 2', 'BOARD 3', 'TRAINING BOARD', 'TOWER']

export async function getBoardSummary(): Promise<{ boards: BoardSummaryRow[]; totals: BoardSummaryRow | null }> {
  const supabase = createAdminClient()
  const [summaryRes, pagesRes] = await Promise.all([
    supabase.from('board_summary').select('*'),
    supabase.from('page_board_map').select('board_name, running_sales, active'),
  ])
  type SumRow = { board_name: string; running_sales: number | null; projection: number | null; goal: number | null; active_count: number | null; up_count: number | null; down_count: number | null; ratio: number | null; subs_pct: number | null; mom_pct: number | null; pct_to_goal: number | null; sub_revenue: number | null }

  // Compute live per-board totals from page_board_map. Sum running_sales for
  // ACTIVE pages only — the rev tracker's per-board running totals also count
  // only the active roster, so including inactive pages here inflated the
  // numbers (e.g. BOARD 1 had 4 inactive pages adding $221k of phantom revenue).
  type LiveRow = { runningSum: number; activeCount: number }
  const live = new Map<string, LiveRow>()
  for (const board of BOARD_DISPLAY_ORDER) live.set(board, { runningSum: 0, activeCount: 0 })
  for (const r of (pagesRes.data ?? []) as { board_name: string; running_sales: number | null; active: boolean | null }[]) {
    const slot = live.get(r.board_name)
    if (!slot) continue
    if (r.active === true) {
      slot.runningSum += (r.running_sales ?? 0)
      slot.activeCount += 1
    }
  }

  const enrich: Record<string, SumRow> = {}
  for (const r of (summaryRes.data ?? []) as SumRow[]) enrich[r.board_name] = r

  const boards: BoardSummaryRow[] = []
  for (const board of BOARD_DISPLAY_ORDER) {
    const liveData = live.get(board) ?? { runningSum: 0, activeCount: 0 }
    const e = enrich[board]
    const goal = e?.goal ?? null
    const running = liveData.runningSum > 0 ? liveData.runningSum : (e?.running_sales ?? null)
    const pctToGoal = e?.pct_to_goal ?? (goal && running != null && goal > 0 ? running / goal : null)
    boards.push({
      boardName: board,
      runningSales: running,
      projection: e?.projection ?? null,
      goal,
      activeCount: liveData.activeCount,
      upCount: e?.up_count ?? null,
      downCount: e?.down_count ?? null,
      ratio: e?.ratio ?? null,
      subsPct: e?.subs_pct ?? null,
      momPct: e?.mom_pct ?? null,
      pctToGoal,
      subRevenue: e?.sub_revenue ?? null,
      pageCount: liveData.activeCount,    // page count = active page count
    })
  }

  // Totals row: prefer the curated TOTALS row from the sheet, else sum live data
  const liveTotal = boards.reduce(
    (acc, b) => ({
      running: acc.running + (b.runningSales ?? 0),
      goal: acc.goal + (b.goal ?? 0),
      active: acc.active + (b.activeCount ?? 0),
    }),
    { running: 0, goal: 0, active: 0 },
  )
  const totalsRow = enrich['TOTALS']
  const totals: BoardSummaryRow = {
    boardName: 'TOTALS',
    runningSales: totalsRow?.running_sales ?? liveTotal.running,
    projection: totalsRow?.projection ?? null,
    goal: totalsRow?.goal ?? (liveTotal.goal > 0 ? liveTotal.goal : null),
    activeCount: totalsRow?.active_count ?? liveTotal.active,
    upCount: totalsRow?.up_count ?? null,
    downCount: totalsRow?.down_count ?? null,
    ratio: totalsRow?.ratio ?? null,
    subsPct: totalsRow?.subs_pct ?? null,
    momPct: totalsRow?.mom_pct ?? null,
    pctToGoal: totalsRow?.pct_to_goal ?? (liveTotal.goal > 0 ? liveTotal.running / liveTotal.goal : null),
    subRevenue: totalsRow?.sub_revenue ?? null,
    pageCount: liveTotal.active,
  }

  return { boards, totals }
}

export type TopCreator = {
  pageName: string
  boardName: string
  runningSales: number | null
  agency: string | null
}

export async function getTopCreators(limit = 5): Promise<TopCreator[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('page_board_map')
    .select('page_name, board_name, running_sales, agency')
    .eq('active', true)
    .not('running_sales', 'is', null)
    .order('running_sales', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`getTopCreators: ${error.message}`)
  return ((data ?? []) as { page_name: string; board_name: string; running_sales: number | null; agency: string | null }[])
    .map(r => ({ pageName: r.page_name, boardName: r.board_name, runningSales: r.running_sales, agency: r.agency }))
}

/**
 * "Active creators" matches the rev tracker's Active column — pages marked
 * active=TRUE in the spreadsheet. Different from `current_stage = 'active'`
 * on candidates (which is hires, not models).
 */
export async function getActiveCreatorCount(): Promise<number> {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('page_board_map')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
  if (error) throw new Error(`getActiveCreatorCount: ${error.message}`)
  return count ?? 0
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
