/**
 * Weekly chatter performance grading.
 * 10 categories, 1-5 stars each. Composite = mean of the 10 scores
 * (NULLs ignored), trajectory = this-week composite vs last-week composite.
 */

import { createAdminClient } from './supabase/admin'

export const GRADE_CATEGORIES = [
  { key: 'communication',   label: 'Communication quality' },
  { key: 'english_skills',  label: 'English skills' },
  { key: 'sales_pitch',     label: 'Sales pitch quality' },
  { key: 'reliability',     label: 'Reliability' },
  { key: 'coachability',    label: 'Coachability' },
  { key: 'multitasking',    label: 'Multitasking / output' },
  { key: 'persona_match',   label: 'Persona match' },
  { key: 'internet_setup',  label: 'Internet / setup' },
  { key: 'empathy',         label: 'Empathy & connection' },
  { key: 'compliance',      label: 'Compliance' },
] as const

export type GradeCategoryKey = typeof GRADE_CATEGORIES[number]['key']

export type GradeScores = Partial<Record<GradeCategoryKey, number | null>>

export type GradeRow = {
  id: string
  candidateId: string
  weekStarting: string                    // YYYY-MM-DD
  graderName: string
  graderRole: string | null
  scores: GradeScores
  notes: string | null
  updatedAt: string
}

export type CandidateGradeSummary = {
  candidateId: string
  composite: number | null                // 0.00 - 5.00, null if never graded
  trajectory: 'up' | 'flat' | 'down' | null
  lastGradedAt: string | null
  lastWeekStarting: string | null
  perCategory: Partial<Record<GradeCategoryKey, number>>     // latest-week average across graders
  graderCount: number                     // graders who scored this chatter most recent week
}

/** Returns the Monday (UTC) of the given date's week. */
export function weekStarting(d: Date = new Date()): string {
  const day = d.getUTCDay()                // 0 = Sunday
  const diff = (day === 0 ? -6 : 1 - day)
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff))
  return monday.toISOString().slice(0, 10)
}

/** Compute the composite score from one row's scores (mean of non-null values). */
export function composite(scores: GradeScores): number | null {
  const vals = GRADE_CATEGORIES
    .map(c => scores[c.key])
    .filter((v): v is number => typeof v === 'number')
  if (vals.length === 0) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function rowToGradeRow(r: Record<string, unknown>): GradeRow {
  const scores: GradeScores = {}
  for (const c of GRADE_CATEGORIES) {
    const v = r[c.key]
    scores[c.key] = typeof v === 'number' ? v : null
  }
  return {
    id: r.id as string,
    candidateId: r.candidate_id as string,
    weekStarting: r.week_starting as string,
    graderName: r.grader_name as string,
    graderRole: (r.grader_role as string | null) ?? null,
    scores,
    notes: (r.notes as string | null) ?? null,
    updatedAt: r.updated_at as string,
  }
}

/**
 * All grades for one chatter, newest first. Used by the candidate modal.
 */
export async function getChatterGrades(candidateId: string): Promise<GradeRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('chatter_grades')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('week_starting', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`getChatterGrades: ${error.message}`)
  return (data ?? []).map(r => rowToGradeRow(r as Record<string, unknown>))
}

/**
 * Summary for many chatters at once. Used by the /grading list page.
 *
 * Returns a map keyed by candidate_id with the most-recent week's composite
 * (averaged across graders), per-category averages, last graded date, and
 * trajectory vs the previous week.
 */
export async function getGradeSummaries(candidateIds: string[]): Promise<Map<string, CandidateGradeSummary>> {
  const result = new Map<string, CandidateGradeSummary>()
  if (candidateIds.length === 0) return result

  const supabase = createAdminClient()
  // Pull all grades for the candidates we care about. With ~400 chatters and
  // a few graders each per week, even a year of data is well under the page
  // cap; PostgREST will paginate if we ever blow past 1000.
  const PAGE = 1000
  const rows: GradeRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('chatter_grades')
      .select('*')
      .in('candidate_id', candidateIds)
      .order('week_starting', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`getGradeSummaries: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data.map(r => rowToGradeRow(r as Record<string, unknown>)))
    if (data.length < PAGE) break
    from += PAGE
  }

  // Group by candidate, then by week
  type WeekAcc = { sumPerCat: Partial<Record<GradeCategoryKey, number>>; countPerCat: Partial<Record<GradeCategoryKey, number>>; graders: Set<string> }
  type PerCandidate = Map<string, WeekAcc>     // weekStarting → WeekAcc
  const byCandidate = new Map<string, PerCandidate>()

  for (const r of rows) {
    let perCand = byCandidate.get(r.candidateId)
    if (!perCand) {
      perCand = new Map()
      byCandidate.set(r.candidateId, perCand)
    }
    let acc = perCand.get(r.weekStarting)
    if (!acc) {
      acc = { sumPerCat: {}, countPerCat: {}, graders: new Set() }
      perCand.set(r.weekStarting, acc)
    }
    acc.graders.add(r.graderName)
    for (const c of GRADE_CATEGORIES) {
      const v = r.scores[c.key]
      if (typeof v === 'number') {
        acc.sumPerCat[c.key] = (acc.sumPerCat[c.key] ?? 0) + v
        acc.countPerCat[c.key] = (acc.countPerCat[c.key] ?? 0) + 1
      }
    }
  }

  for (const candidateId of candidateIds) {
    const perCand = byCandidate.get(candidateId)
    if (!perCand || perCand.size === 0) {
      result.set(candidateId, { candidateId, composite: null, trajectory: null, lastGradedAt: null, lastWeekStarting: null, perCategory: {}, graderCount: 0 })
      continue
    }
    const weeks = [...perCand.keys()].sort((a, b) => b.localeCompare(a))    // newest first
    const latestWeek = weeks[0]
    const latest = perCand.get(latestWeek)!
    const prevWeek = weeks[1]
    const prev = prevWeek ? perCand.get(prevWeek) : null

    const perCategory: Partial<Record<GradeCategoryKey, number>> = {}
    let sum = 0
    let n = 0
    for (const c of GRADE_CATEGORIES) {
      const s = latest.sumPerCat[c.key]
      const ct = latest.countPerCat[c.key]
      if (s !== undefined && ct && ct > 0) {
        const avg = s / ct
        perCategory[c.key] = avg
        sum += avg
        n += 1
      }
    }
    const composite = n > 0 ? sum / n : null

    // Trajectory: compare to previous week's composite
    let trajectory: 'up' | 'flat' | 'down' | null = null
    if (prev && composite !== null) {
      let prevSum = 0, prevN = 0
      for (const c of GRADE_CATEGORIES) {
        const s = prev.sumPerCat[c.key]
        const ct = prev.countPerCat[c.key]
        if (s !== undefined && ct && ct > 0) {
          prevSum += s / ct
          prevN += 1
        }
      }
      if (prevN > 0) {
        const prevComp = prevSum / prevN
        const delta = composite - prevComp
        trajectory = delta >= 0.3 ? 'up' : delta <= -0.3 ? 'down' : 'flat'
      }
    }

    result.set(candidateId, {
      candidateId,
      composite,
      trajectory,
      lastGradedAt: latestWeek,        // approximate — we don't track updated_at across graders here
      lastWeekStarting: latestWeek,
      perCategory,
      graderCount: latest.graders.size,
    })
  }

  return result
}
