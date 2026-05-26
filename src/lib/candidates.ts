export type Trajectory = 'up' | 'down' | 'flat' | null
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F' | null

export type TimelineEntry = {
  date: string
  title: string
  type: 'up' | 'down' | 'flat'
  grade?: Grade
}

export type Region = 'PH' | 'EU' | 'SA' | 'UK'
export type StageKey = 'typeform' | 'passed' | 'pending' | 'scheduled' | 'training' | 'standby' | 'active'

export type Candidate = {
  id: string
  name: string
  region: Region
  stage: string
  stageKey: StageKey
  grade: Grade
  trajectory: Trajectory
  manager: string
  days: number
  tags: { strengths: string[]; flags: string[] }
  timeline: TimelineEntry[]
  notes: { date: string; text: string }[]
}

export const CANDIDATES: Record<string, Candidate> = {
  'maria-l': { id: 'maria-l', name: 'Maria L.', region: 'EU', stage: 'Week 1 · Day 3', stageKey: 'training', grade: 'A', trajectory: 'up', manager: 'Aleksandar', days: 3,
    tags: { strengths: ['Fast learner', 'Personality'], flags: [] },
    timeline: [
      { date: 'May 13', title: 'Submitted typeform', type: 'flat' },
      { date: 'May 15', title: 'Interview passed', type: 'up', grade: 'B' },
      { date: 'May 18', title: 'Day 3 score 9/10', type: 'up', grade: 'A' },
    ], notes: [] },
  'ivan-p': { id: 'ivan-p', name: 'Ivan P.', region: 'EU', stage: 'Week 1 · Day 3', stageKey: 'training', grade: 'D', trajectory: 'down', manager: 'Aleksandar', days: 3,
    tags: { strengths: [], flags: ['Slow start'] },
    timeline: [{ date: 'May 18', title: 'Day 3 score 4/10', type: 'down', grade: 'D' }], notes: [] },
  'sofia-m': { id: 'sofia-m', name: 'Sofia M.', region: 'EU', stage: 'Week 1 Exp · Day 3', stageKey: 'training', grade: 'A', trajectory: 'up', manager: 'Aleksandar', days: 3,
    tags: { strengths: ['Experienced 3yr'], flags: [] }, timeline: [], notes: [] },
  'anna-g': { id: 'anna-g', name: 'Anna G.', region: 'PH', stage: 'Lane A · Week 1 · Day 3', stageKey: 'training', grade: 'A', trajectory: 'up', manager: 'Joan', days: 3,
    tags: { strengths: ['Grammar', 'Hustle'], flags: [] }, timeline: [], notes: [] },
  'bea-m': { id: 'bea-m', name: 'Bea M.', region: 'PH', stage: 'Lane A · Week 1 · Day 3', stageKey: 'training', grade: 'A', trajectory: 'up', manager: 'Joan', days: 3,
    tags: { strengths: ['Personality'], flags: [] }, timeline: [], notes: [] },
  'maja-p': { id: 'maja-p', name: 'Maja P.', region: 'PH', stage: 'Lane B · Week 1 · Day 3', stageKey: 'training', grade: 'F', trajectory: 'down', manager: 'Mark', days: 3,
    tags: { strengths: [], flags: ['Late replies', 'Low engagement'] },
    timeline: [{ date: 'May 18', title: 'Day 3 score 3/10', type: 'down', grade: 'F' }], notes: [] },
  'james-t': { id: 'james-t', name: 'James T.', region: 'UK', stage: 'Week 1 · Day 5', stageKey: 'training', grade: 'D', trajectory: 'down', manager: 'Noah', days: 5,
    tags: { strengths: [], flags: ['Tech issues'] }, timeline: [], notes: [] },
  'jenna-k': { id: 'jenna-k', name: 'Jenna K.', region: 'PH', stage: 'Interview today 1pm', stageKey: 'scheduled', grade: 'A', trajectory: 'flat', manager: 'Apple', days: 0,
    tags: { strengths: ['Experienced 2yr'], flags: [] }, timeline: [], notes: [] },
  'maria-s': { id: 'maria-s', name: 'Maria S.', region: 'PH', stage: 'Interview today 10am', stageKey: 'scheduled', grade: null, trajectory: null, manager: 'Apple', days: 0,
    tags: { strengths: [], flags: [] }, timeline: [], notes: [] },
  'lena-w': { id: 'lena-w', name: 'Lena W.', region: 'EU', stage: 'Interview today 2pm CET', stageKey: 'scheduled', grade: null, trajectory: null, manager: 'Aleksandar', days: 0,
    tags: { strengths: [], flags: [] }, timeline: [], notes: [] },
  'pablo-g': { id: 'pablo-g', name: 'Pablo G.', region: 'SA', stage: 'Interview today 3pm BRT', stageKey: 'scheduled', grade: 'C', trajectory: 'down', manager: 'Sebastien', days: 0,
    tags: { strengths: [], flags: ['Late to call'] }, timeline: [], notes: [] },
  'carlos-m': { id: 'carlos-m', name: 'Carlos M.', region: 'SA', stage: 'Pending Interview · 6d', stageKey: 'pending', grade: 'B', trajectory: 'flat', manager: 'Sebastien', days: 6,
    tags: { strengths: ['Experienced'], flags: [] }, timeline: [], notes: [] },
  'lucia-r': { id: 'lucia-r', name: 'Lucia R.', region: 'SA', stage: 'Pending Interview · 5d', stageKey: 'pending', grade: 'C', trajectory: 'flat', manager: 'Sebastien', days: 5,
    tags: { strengths: [], flags: [] }, timeline: [], notes: [] },
  'diego-f': { id: 'diego-f', name: 'Diego F.', region: 'SA', stage: 'Pending Interview · 4d', stageKey: 'pending', grade: 'D', trajectory: 'flat', manager: 'Sebastien', days: 4,
    tags: { strengths: [], flags: ['Ghosting'] }, timeline: [], notes: [] },
  'fsf': { id: 'fsf', name: 'FSF', region: 'UK', stage: 'Typeform · 5d', stageKey: 'typeform', grade: null, trajectory: 'down', manager: 'Noah', days: 5,
    tags: { strengths: [], flags: ['Stuck'] }, timeline: [], notes: [] },
  'noah-whall': { id: 'noah-whall', name: 'Noah Whall', region: 'UK', stage: 'Typeform · 5d', stageKey: 'typeform', grade: null, trajectory: 'down', manager: 'Noah', days: 5,
    tags: { strengths: [], flags: ['Stuck'] }, timeline: [], notes: [] },
  'noah': { id: 'noah', name: 'NOAH', region: 'UK', stage: 'Typeform · 6d', stageKey: 'typeform', grade: null, trajectory: 'down', manager: 'Noah', days: 6,
    tags: { strengths: [], flags: ['Stuck'] }, timeline: [], notes: [] },
  'john-k': { id: 'john-k', name: 'John K.', region: 'UK', stage: 'Typeform · 5d', stageKey: 'typeform', grade: null, trajectory: 'down', manager: 'Noah', days: 5,
    tags: { strengths: [], flags: ['Stuck'] }, timeline: [], notes: [] },
}

export type SegmentFilter =
  | { kind: 'stage'; region: Region; stage: StageKey }
  | { kind: 'grade'; region: Region; grade: 'A' | 'B' | 'C' | 'D' | 'F' }
  | { kind: 'group'; region: Region; groupTitle: string }   // exact Monday group title
  | { kind: 'all'; region: Region }

export function parseSegment(value: string | null | undefined): SegmentFilter | null {
  if (!value) return null
  const firstColon = value.indexOf(':')
  if (firstColon < 0) return null
  const regionRaw = value.slice(0, firstColon)
  const rest = value.slice(firstColon + 1)
  if (!regionRaw || !rest) return null
  const region = regionRaw.toUpperCase() as Region
  if (!['PH', 'EU', 'SA', 'UK'].includes(region)) return null

  if (rest === 'all') return { kind: 'all', region }
  if (rest.startsWith('grade-')) {
    const grade = rest.slice(6).toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'F'
    if (!['A', 'B', 'C', 'D', 'F'].includes(grade)) return null
    return { kind: 'grade', region, grade }
  }
  if (rest.startsWith('group:')) {
    const groupTitle = rest.slice(6)
    if (!groupTitle) return null
    return { kind: 'group', region, groupTitle }
  }
  const stage = rest as StageKey
  if (!['typeform', 'passed', 'pending', 'scheduled', 'training', 'standby', 'active'].includes(stage)) return null
  return { kind: 'stage', region, stage }
}

export function filterCandidates(filter: SegmentFilter): Candidate[] {
  const all = Object.values(CANDIDATES).filter(c => c.region === filter.region)
  if (filter.kind === 'all') return all
  if (filter.kind === 'stage') return all.filter(c => c.stageKey === filter.stage)
  if (filter.kind === 'group') return all.filter(c => c.stage === filter.groupTitle)
  return all.filter(c => c.grade === filter.grade)
}

const REGION_LABELS: Record<Region, { flag: string; name: string }> = {
  PH: { flag: '🇵🇭', name: 'Philippines' },
  EU: { flag: '🇪🇺', name: 'Europe' },
  SA: { flag: '🇧🇷', name: 'South America' },
  UK: { flag: '🇬🇧', name: 'United Kingdom' },
}

export function segmentLabel(filter: SegmentFilter): { title: string; sub: string } {
  const r = REGION_LABELS[filter.region]
  const headline = `${r.flag} ${r.name}`
  if (filter.kind === 'all') return { title: headline, sub: 'All candidates in pipeline' }
  if (filter.kind === 'grade') return { title: headline, sub: `Grade ${filter.grade}` }
  if (filter.kind === 'group') return { title: headline, sub: filter.groupTitle }
  const stageLabels: Record<StageKey, string> = {
    typeform: 'Typeform', passed: 'Passed', pending: 'Pending interview',
    scheduled: 'Scheduled interview', training: 'In training', standby: 'Standby', active: 'Active hires',
  }
  return { title: headline, sub: stageLabels[filter.stage] }
}

export function getCandidate(id: string | null | undefined): Candidate | null {
  if (!id) return null
  return CANDIDATES[id] || null
}

export const gradeColors: Record<string, string> = { A: '#4ade80', B: '#60a5fa', C: '#fde047', D: '#fb923c', F: '#ef4444' }
export const gradeBg: Record<string, string> = { A: 'rgba(74,222,128,0.15)', B: 'rgba(96,165,250,0.15)', C: 'rgba(253,224,71,0.15)', D: 'rgba(251,146,60,0.15)', F: 'rgba(239,68,68,0.18)' }

export function trajectoryIcon(t: Trajectory): string {
  if (t === 'up') return '↑'
  if (t === 'down') return '↓'
  if (t === 'flat') return '→'
  return ''
}

export function trajectoryColor(t: Trajectory): string {
  if (t === 'up') return 'var(--green)'
  if (t === 'down') return 'var(--red)'
  return 'var(--text-3)'
}

export function nameToId(name: string): string {
  return name.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/**
 * Display info for a Monday "Tier" column value.
 * Tier 1 = weakest, Tier 4 = best (see memory/project_tier_scale.md).
 * Strings like "TIER 1", "EU 1", "TBD".
 */
export type TierDisplay = { label: string; color: string; bg: string; rank: number | null }

const TIER_PALETTE_LOW_TO_HIGH: { color: string; bg: string }[] = [
  { color: '#ef4444', bg: 'rgba(239,68,68,0.18)' },    // 1 = weakest → red
  { color: '#fb923c', bg: 'rgba(251,146,60,0.15)' },   // 2 = below avg → orange
  { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },   // 3 = strong → blue
  { color: '#4ade80', bg: 'rgba(74,222,128,0.15)' },   // 4 = best → green
]

export function tierDisplay(tier: string | null | undefined): TierDisplay | null {
  if (!tier) return null
  const norm = tier.trim().toUpperCase()
  // A/B/C/D/F (future formal grading — A = best, F = worst, conventional)
  if (['A', 'B', 'C', 'D', 'F'].includes(norm)) {
    return { label: norm, color: gradeColors[norm], bg: gradeBg[norm], rank: { A: 4, B: 3, C: 2, D: 1, F: 0 }[norm] ?? null }
  }
  // Numbered tiers ("TIER 1", "TIER 2", ..., "EU 1"). Higher number = better.
  const match = norm.match(/(\d+)/)
  if (match) {
    const n = parseInt(match[1], 10)
    const idx = Math.min(Math.max(n - 1, 0), TIER_PALETTE_LOW_TO_HIGH.length - 1)
    const p = TIER_PALETTE_LOW_TO_HIGH[idx]
    return { label: `T${n}`, color: p.color, bg: p.bg, rank: n }
  }
  // Anything else (TBD, etc) → neutral
  return { label: tier.length <= 4 ? tier : tier.slice(0, 4), color: 'var(--text-2)', bg: 'var(--surface-3)', rank: null }
}

export function tierRank(tier: string | null | undefined): number | null {
  return tierDisplay(tier)?.rank ?? null
}

// Canonical groupings — use these everywhere instead of inlining the tier values.
export const TOP_PERFORMER_TIERS = ['TIER 3', 'TIER 4', 'A', 'B']
export const AT_RISK_TIERS = ['TIER 1', 'TIER 2', 'EU 1', 'D', 'F']
