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

import { findColumnId, setNumberColumnValue, setStatusColumnValue, type ParsedGrade } from './monday'

type Region = 'PH' | 'EU' | 'SA' | 'UK'

const REGION_BOARD_ENV: Record<Region, string> = {
  PH: 'MONDAY_BOARD_ID_PH',
  EU: 'MONDAY_BOARD_ID_EU',
  SA: 'MONDAY_BOARD_ID_SA',
  UK: 'MONDAY_BOARD_ID_UK',
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

function trajectoryLabel(latest: number, prev: number | null): string {
  if (prev === null) return '→ Flat'
  const delta = latest - prev
  if (delta >= 0.3) return '↑ Up'
  if (delta <= -0.3) return '↓ Down'
  return '→ Flat'
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

    // Look up column ids on this board once.
    const [chatterGradeColId, trajectoryColId, salesColId] = await Promise.all([
      findColumnId(boardId, 'Chatter Grade').catch(() => null),
      findColumnId(boardId, 'Trajectory').catch(() => null),
      findColumnId(boardId, 'Sales Generated $').catch(() => null),
    ])

    if (!chatterGradeColId && !trajectoryColId && !salesColId) {
      warnings.push(`Region ${region}: parent grading columns not found — skipping write-back`)
      continue
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

      try {
        if (chatterGradeColId) {
          await setNumberColumnValue(boardId, parentItemId, chatterGradeColId, Number(latestComp.toFixed(2)))
        }
        if (trajectoryColId) {
          await setStatusColumnValue(boardId, parentItemId, trajectoryColId, trajectoryLabel(latestComp, prevComp))
        }
        if (salesColId && latest.sales_generated_dollars !== null) {
          await setNumberColumnValue(boardId, parentItemId, salesColId, latest.sales_generated_dollars)
        }
        writeCount += 1
      } catch (err) {
        warnings.push(`Write-back failed for ${region} item ${parentItemId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  return writeCount
}
