/**
 * After grading subitems are pulled from Monday and stored in Supabase, this
 * step computes per-chatter:
 *   - composite (mean of the 9 non-null ratings on the latest subitem)
 *   - trajectory (latest vs previous subitem composite, with a ±0.3 deadband)
 *   - latest sales $ for the period
 * And pushes those three values back to the chatter's PARENT row on Monday so
 * managers see the headline numbers without opening subitems.
 *
 * Safety:
 *   - Skips chatters with no grading subitems (does not clear existing values).
 *   - Skips chatters whose composite is null (no ratings yet).
 *   - Column ids are looked up per-board once and cached for the call.
 */

import { findColumnId, fetchBoardColumnsDetailed, setNumberColumnValue, setStatusColumnValue, type ParsedGrade } from './monday'

type Region = 'PH' | 'EU' | 'SA'

const REGION_BOARD_ENV: Record<Region, string> = {
  PH: 'MONDAY_BOARD_ID_PH',
  EU: 'MONDAY_BOARD_ID_EU',
  SA: 'MONDAY_BOARD_ID_SA',
}

const RATING_KEYS: (keyof ParsedGrade)[] = [
  'ppv_captions', 'sexting_message_quality', 'hooks_opening_lines', 'reply_time',
  'golden_ratio', 'persona_match', 'whale_handling', 'english_skills', 'reliability',
]

function composite(g: ParsedGrade): number | null {
  const vals = RATING_KEYS.map(k => g[k] as number | null).filter((v): v is number => typeof v === 'number')
  if (vals.length === 0) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

type TrajectoryDirection = 'up' | 'flat' | 'down'

function trajectoryDirection(latest: number, prev: number | null): TrajectoryDirection {
  if (prev === null) return 'flat'
  const delta = latest - prev
  if (delta >= 0.3) return 'up'
  if (delta <= -0.3) return 'down'
  return 'flat'
}

/**
 * Match a TrajectoryDirection to the actual labels configured on a Monday
 * Status column so we don't have to assume the operator named them "↑ Up"
 * exactly. Picks the first label that contains the direction keyword.
 */
function matchTrajectoryLabel(direction: TrajectoryDirection, labels: string[]): string | null {
  const keywords: Record<TrajectoryDirection, string[]> = {
    up: ['up', '↑', 'rising', 'improving'],
    flat: ['flat', '→', 'stable', 'unchanged'],
    down: ['down', '↓', 'falling', 'declining'],
  }
  const wanted = keywords[direction]
  for (const label of labels) {
    const lower = label.toLowerCase()
    if (wanted.some(k => lower.includes(k))) return label
  }
  return null
}

function parseStatusLabels(settingsStr: string | null): string[] {
  if (!settingsStr) return []
  try {
    const s = JSON.parse(settingsStr)
    if (s.labels && typeof s.labels === 'object' && !Array.isArray(s.labels)) {
      return Object.values(s.labels) as string[]
    }
    if (Array.isArray(s.labels)) {
      return s.labels.map((l: { name?: string } | string) => typeof l === 'string' ? l : (l.name ?? '')).filter(Boolean)
    }
    return []
  } catch { return [] }
}

export async function computeAndWriteBackGrades(
  perRegion: { region: Region; subitems: ParsedGrade[] }[],
  warnings: string[],
): Promise<number> {
  let writeCount = 0

  for (const { region, subitems } of perRegion) {
    if (subitems.length === 0) continue
    const boardId = process.env[REGION_BOARD_ENV[region]]
    if (!boardId) continue

    // Look up column metadata on this board once.
    const allCols = await fetchBoardColumnsDetailed(boardId)
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const chatterGradeCol = allCols.find(c => normalise(c.title) === 'chattergrade')
    const trajectoryCol = allCols.find(c => normalise(c.title) === 'trajectory')
    const salesCol = allCols.find(c => normalise(c.title) === 'salesgenerated' || normalise(c.title) === 'salesgenerated$')

    if (!chatterGradeCol && !trajectoryCol && !salesCol) {
      warnings.push(`Region ${region}: parent grading columns not found — skipping write-back. Columns on board: ${allCols.map(c => c.title).join(', ')}`)
      continue
    }
    // Specifically flag the missing ones — the operator will see exactly which
    // parent column is failing the lookup.
    if (!salesCol) warnings.push(`Region ${region}: Sales Generated column not found. Columns: ${allCols.filter(c => /sales|gen|\$/i.test(c.title)).map(c => `"${c.title}" (${c.type})`).join(', ') || '(none matching)'}`)
    if (!trajectoryCol) warnings.push(`Region ${region}: Trajectory column not found`)
    if (!chatterGradeCol) warnings.push(`Region ${region}: Chatter Grade column not found`)

    const trajectoryLabels = trajectoryCol ? parseStatusLabels(trajectoryCol.settings_str) : []
    if (trajectoryCol && trajectoryLabels.length === 0) {
      warnings.push(`Region ${region}: Trajectory column has no labels configured`)
    }

    // Group subitems by parent (chatter)
    const byParent = new Map<string, ParsedGrade[]>()
    for (const s of subitems) {
      const arr = byParent.get(s.parent_item_id) ?? []
      arr.push(s)
      byParent.set(s.parent_item_id, arr)
    }

    for (const [parentItemId, gradesForChatter] of byParent) {
      // Sort newest → oldest by Monday's updated_at, falling back to created_at
      const sorted = [...gradesForChatter].sort((a, b) => {
        const aT = a.monday_updated_at ?? a.monday_created_at ?? ''
        const bT = b.monday_updated_at ?? b.monday_created_at ?? ''
        return bT.localeCompare(aT)
      })
      const latest = sorted[0]
      const prev = sorted[1] ?? null

      const latestComp = composite(latest)
      if (latestComp === null) continue   // no ratings filled yet — don't write

      const prevComp = prev ? composite(prev) : null

      // Each write is independent. A failure on one column doesn't block the others.
      let anyWrote = false

      if (chatterGradeCol) {
        try {
          await setNumberColumnValue(boardId, parentItemId, chatterGradeCol.id, Number(latestComp.toFixed(2)))
          anyWrote = true
        } catch (err) {
          warnings.push(`[${region} ${parentItemId}] Chatter Grade write failed: ${errMsg(err)}`)
        }
      }

      if (trajectoryCol) {
        const direction = trajectoryDirection(latestComp, prevComp)
        const label = matchTrajectoryLabel(direction, trajectoryLabels)
        if (!label) {
          warnings.push(`[${region}] Trajectory: no label matches "${direction}". Configured: ${trajectoryLabels.join(', ') || '(none)'}`)
        } else {
          try {
            await setStatusColumnValue(boardId, parentItemId, trajectoryCol.id, label)
            anyWrote = true
          } catch (err) {
            warnings.push(`[${region} ${parentItemId}] Trajectory write failed: ${errMsg(err)}`)
          }
        }
      }

      if (salesCol && latest.sales_generated_dollars !== null) {
        try {
          await setNumberColumnValue(boardId, parentItemId, salesCol.id, latest.sales_generated_dollars)
          anyWrote = true
        } catch (err) {
          warnings.push(`[${region} ${parentItemId}] Sales Generated $ write failed: ${errMsg(err)}`)
        }
      }

      if (anyWrote) writeCount += 1
    }
  }

  return writeCount
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
