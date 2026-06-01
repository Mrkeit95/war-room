'use server'

import {
  fetchBoardColumnsDetailed,
  createColumn,
  getSubitemBoardId,
  createPlaceholderSubitem,
  findFirstItemId,
  deleteItem,
  type ColumnDetail,
} from '@/lib/monday'

// The columns we want present on every region board (parent + subitem).
// Match against PH so any tweaks to PH's structure propagate automatically.
const PARENT_GRADING_COLUMN_TITLES = [
  'Fan Preference',
  'Chatter Grade',
  'Chat style',
  'Sales Generated $',
  'Trajectory',
]

const SUBITEM_GRADING_COLUMN_TITLES = [
  'Grader',
  'PPV captions',
  'Sexting / Message Quality',
  'Sexting/ Message Quality',           // tolerate the spacing variant on the screenshot
  'Hooks & Opening lines',
  'Reply time',
  'Golden Ratio',
  'Persona Match',
  'Whale Handling',
  'English Skills',
  'Reliability',
  'Sales Generated $',
]

export type ReplicateResult =
  | { ok: true; perBoard: Array<{ board: string; created: string[]; skipped: string[]; subitemBoardId: string | null }> }
  | { ok: false; error: string }

/**
 * Replicate grading column structure from PH → EU, SA, UK.
 * Idempotent: if a column with the same title already exists on the target,
 * we skip it.
 */
export async function replicateGradingColumns(): Promise<ReplicateResult> {
  try {
    const sourceBoardId = process.env.MONDAY_BOARD_ID_PH
    const targets: { name: string; id: string | undefined }[] = [
      { name: 'EU', id: process.env.MONDAY_BOARD_ID_EU },
      { name: 'SA', id: process.env.MONDAY_BOARD_ID_SA },
      { name: 'UK', id: process.env.MONDAY_BOARD_ID_UK },
    ]
    if (!sourceBoardId) return { ok: false, error: 'MONDAY_BOARD_ID_PH not set' }
    for (const t of targets) {
      if (!t.id) return { ok: false, error: `MONDAY_BOARD_ID_${t.name} not set` }
    }

    // 1. Load PH's column metadata (main + subitem boards).
    const sourceMainCols = await fetchBoardColumnsDetailed(sourceBoardId)
    const sourceSubBoardId = await getSubitemBoardId(sourceBoardId)
    if (!sourceSubBoardId) {
      return { ok: false, error: 'PH has no subitem board yet — add at least one subitem on PH before replicating' }
    }
    const sourceSubCols = await fetchBoardColumnsDetailed(sourceSubBoardId)

    const parentToCopy = PARENT_GRADING_COLUMN_TITLES
      .map(title => findColByTitle(sourceMainCols, title))
      .filter((c): c is ColumnDetail => !!c)

    const subitemToCopy = uniqueByTitle(
      SUBITEM_GRADING_COLUMN_TITLES
        .map(title => findColByTitle(sourceSubCols, title))
        .filter((c): c is ColumnDetail => !!c),
    )

    if (parentToCopy.length === 0 && subitemToCopy.length === 0) {
      return { ok: false, error: 'No grading columns found on PH to copy. Check titles.' }
    }

    const perBoard: { board: string; created: string[]; skipped: string[]; subitemBoardId: string | null }[] = []

    // 2. For each target board, create the missing columns.
    for (const t of targets) {
      if (!t.id) continue
      const created: string[] = []
      const skipped: string[] = []

      const targetMainCols = await fetchBoardColumnsDetailed(t.id)

      // Parent columns
      for (const src of parentToCopy) {
        if (findColByTitle(targetMainCols, src.title)) {
          skipped.push(`(parent) ${src.title}`)
          continue
        }
        await createColumn({
          boardId: t.id,
          title: src.title,
          columnType: src.type,
          defaultsJson: src.settings_str ?? null,
        })
        created.push(`(parent) ${src.title}`)
      }

      // Subitems — must initialise subitem board if missing.
      let targetSubBoardId = await getSubitemBoardId(t.id)
      let placeholderSubitemId: string | null = null
      if (!targetSubBoardId) {
        const firstItem = await findFirstItemId(t.id)
        if (!firstItem) {
          perBoard.push({ board: t.name, created, skipped: [...skipped, '(subitems skipped — no items on this board to seed from)'], subitemBoardId: null })
          continue
        }
        placeholderSubitemId = await createPlaceholderSubitem(firstItem, '__init__')
        targetSubBoardId = await getSubitemBoardId(t.id)
      }

      if (!targetSubBoardId) {
        perBoard.push({ board: t.name, created, skipped: [...skipped, '(subitems skipped — could not init subitem board)'], subitemBoardId: null })
        continue
      }

      const targetSubCols = await fetchBoardColumnsDetailed(targetSubBoardId)
      for (const src of subitemToCopy) {
        if (findColByTitle(targetSubCols, src.title)) {
          skipped.push(`(subitem) ${src.title}`)
          continue
        }
        await createColumn({
          boardId: targetSubBoardId,
          title: src.title,
          columnType: src.type,
          defaultsJson: src.settings_str ?? null,
        })
        created.push(`(subitem) ${src.title}`)
      }

      // Clean up the placeholder subitem we created to initialise subitems.
      if (placeholderSubitemId) await deleteItem(placeholderSubitemId)

      perBoard.push({ board: t.name, created, skipped, subitemBoardId: targetSubBoardId })
    }

    return { ok: true, perBoard }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function findColByTitle(cols: ColumnDetail[], title: string): ColumnDetail | undefined {
  const lower = title.toLowerCase()
  return cols.find(c => c.title.toLowerCase() === lower)
}

function uniqueByTitle(cols: ColumnDetail[]): ColumnDetail[] {
  const seen = new Set<string>()
  const out: ColumnDetail[] = []
  for (const c of cols) {
    const key = c.title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

// ---------------------------------------------------------------------------
// Verifier — compare EU/SA/UK to PH for the grading columns
// ---------------------------------------------------------------------------

export type ColumnDiff =
  | { title: string; status: 'ok' }
  | { title: string; status: 'missing' }
  | { title: string; status: 'type-mismatch'; sourceType: string; targetType: string }
  | { title: string; status: 'options-mismatch'; missingOptions: string[]; extraOptions: string[] }

export type BoardDiff = {
  board: string
  parent: ColumnDiff[]
  subitem: ColumnDiff[]
  subitemBoardId: string | null
}

export type VerifyResult =
  | { ok: true; perBoard: BoardDiff[] }
  | { ok: false; error: string }

export async function verifyGradingColumns(): Promise<VerifyResult> {
  try {
    const sourceBoardId = process.env.MONDAY_BOARD_ID_PH
    const targets: { name: string; id: string | undefined }[] = [
      { name: 'EU', id: process.env.MONDAY_BOARD_ID_EU },
      { name: 'SA', id: process.env.MONDAY_BOARD_ID_SA },
      { name: 'UK', id: process.env.MONDAY_BOARD_ID_UK },
    ]
    if (!sourceBoardId) return { ok: false, error: 'MONDAY_BOARD_ID_PH not set' }

    const sourceMainCols = await fetchBoardColumnsDetailed(sourceBoardId)
    const sourceSubBoardId = await getSubitemBoardId(sourceBoardId)
    if (!sourceSubBoardId) return { ok: false, error: 'PH has no subitem board yet' }
    const sourceSubCols = await fetchBoardColumnsDetailed(sourceSubBoardId)

    const sourceParentCols = PARENT_GRADING_COLUMN_TITLES
      .map(t => findColByTitle(sourceMainCols, t))
      .filter((c): c is ColumnDetail => !!c)

    const sourceSubitemCols = uniqueByTitle(
      SUBITEM_GRADING_COLUMN_TITLES
        .map(t => findColByTitle(sourceSubCols, t))
        .filter((c): c is ColumnDetail => !!c),
    )

    const perBoard: BoardDiff[] = []
    for (const t of targets) {
      if (!t.id) { perBoard.push({ board: t.name, parent: [], subitem: [], subitemBoardId: null }); continue }
      const targetMainCols = await fetchBoardColumnsDetailed(t.id)
      const targetSubBoardId = await getSubitemBoardId(t.id)
      const targetSubCols = targetSubBoardId ? await fetchBoardColumnsDetailed(targetSubBoardId) : []

      const parentDiff = sourceParentCols.map(src => diffColumn(src, findColByTitle(targetMainCols, src.title)))
      const subDiff = sourceSubitemCols.map(src => diffColumn(src, findColByTitle(targetSubCols, src.title)))

      perBoard.push({ board: t.name, parent: parentDiff, subitem: subDiff, subitemBoardId: targetSubBoardId })
    }

    return { ok: true, perBoard }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function diffColumn(src: ColumnDetail, target: ColumnDetail | undefined): ColumnDiff {
  if (!target) return { title: src.title, status: 'missing' }
  if (target.type !== src.type) {
    return { title: src.title, status: 'type-mismatch', sourceType: src.type, targetType: target.type }
  }
  // For status/dropdown columns, compare option lists
  if (src.type === 'status' || src.type === 'dropdown' || src.type === 'color') {
    const srcOptions = parseColumnOptions(src.settings_str)
    const targetOptions = parseColumnOptions(target.settings_str)
    const srcSet = new Set(srcOptions.map(o => o.toLowerCase()))
    const targetSet = new Set(targetOptions.map(o => o.toLowerCase()))
    const missing = [...srcSet].filter(o => !targetSet.has(o))
    const extra = [...targetSet].filter(o => !srcSet.has(o))
    if (missing.length > 0 || extra.length > 0) {
      return { title: src.title, status: 'options-mismatch', missingOptions: missing, extraOptions: extra }
    }
  }
  return { title: src.title, status: 'ok' }
}

function parseColumnOptions(settingsStr: string | null): string[] {
  if (!settingsStr) return []
  try {
    const s = JSON.parse(settingsStr)
    // Status columns: {"labels": {"0": "Label A", "1": "Label B"}}
    if (s.labels && typeof s.labels === 'object') {
      return Object.values(s.labels) as string[]
    }
    // Dropdown columns: {"labels": [{"name": "..."}, ...]}
    if (Array.isArray(s.labels)) {
      return s.labels.map((l: { name?: string } | string) => typeof l === 'string' ? l : (l.name ?? '')).filter(Boolean)
    }
    return []
  } catch { return [] }
}
