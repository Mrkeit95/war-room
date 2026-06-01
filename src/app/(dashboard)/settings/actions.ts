'use server'

import {
  fetchAllSubitems,
  fetchBoardColumnsDetailed,
  createColumn,
  createPlaceholderSubitem,
  deleteItem,
  findFirstItemId,
  getSubitemBoardId,
  type ColumnDetail,
} from '@/lib/monday'
import { createAdminClient } from '@/lib/supabase/admin'

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
      if (placeholderSubitemId) try { await deleteItem(placeholderSubitemId) } catch {/* best-effort cleanup */}

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

// ---------------------------------------------------------------------------
// Bulk-create monthly grading subitems on every active chatter
// ---------------------------------------------------------------------------

export type BulkSeedResult =
  | { ok: true; subitemName: string; activeChattersFound: number; alreadySeeded: number; created: number; failed: number; failedSamples: string[] }
  | { ok: false; error: string }

function currentMonthLabel(d: Date = new Date()): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * For every chatter currently in the ACTIVE Monday group, create one empty
 * grading subitem named after the current month (e.g. "June 2026"). Skips any
 * chatter who already has a subitem with that exact name this run, so it's
 * safe to re-run.
 *
 * Why this is a one-click button instead of automatic: it writes to Monday,
 * 400+ items at a time. The operator should be the one to pull the trigger.
 */
export async function bulkSeedMonthlyGradeSubitems(): Promise<BulkSeedResult> {
  try {
    const supabase = createAdminClient()
    const subitemName = currentMonthLabel()

    // 1. Active chatters — defined as current_group_title = 'ACTIVE' on Monday
    //    (the cross-region pool). Use that rather than current_stage so we
    //    match the exact roster the operator sees in the ACTIVE Monday group.
    const PAGE = 1000
    type C = { id: string; monday_item_id: string; name: string }
    const all: C[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, monday_item_id, name')
        .eq('current_group_title', 'ACTIVE')
        .range(from, from + PAGE - 1)
      if (error) return { ok: false, error: `Active chatter query failed: ${error.message}` }
      if (!data || data.length === 0) break
      all.push(...(data as C[]))
      if (data.length < PAGE) break
      from += PAGE
    }
    const activeChatters = all.filter(c => !!c.monday_item_id)

    if (activeChatters.length === 0) {
      return { ok: false, error: 'No active chatters found (current_group_title = "ACTIVE"). Sync first.' }
    }

    // 2. Idempotency — find chatters that already have a subitem named after
    //    this month so we don't double-seed if re-run.
    const parentIds = activeChatters.map(c => c.monday_item_id)
    const alreadySeededSet = new Set<string>()
    for (let i = 0; i < parentIds.length; i += 200) {
      const slice = parentIds.slice(i, i + 200)
      const { data } = await supabase
        .from('chatter_grades')
        .select('monday_parent_item_id, subitem_name')
        .in('monday_parent_item_id', slice)
        .eq('subitem_name', subitemName)
      for (const r of (data ?? []) as { monday_parent_item_id: string }[]) {
        alreadySeededSet.add(r.monday_parent_item_id)
      }
    }

    const todo = activeChatters.filter(c => !alreadySeededSet.has(c.monday_item_id))

    // 3. Create one subitem per chatter. Monday's rate limit on most plans is
    //    high enough that 400+ serial calls run in ~10-20s. We don't parallelise
    //    because we want any rate-limit errors to surface predictably.
    let created = 0
    let failed = 0
    const failedSamples: string[] = []
    for (const c of todo) {
      const id = await createPlaceholderSubitem(c.monday_item_id, subitemName)
      if (id) {
        created += 1
      } else {
        failed += 1
        if (failedSamples.length < 5) failedSamples.push(c.name)
      }
    }

    return {
      ok: true,
      subitemName,
      activeChattersFound: activeChatters.length,
      alreadySeeded: alreadySeededSet.size,
      created,
      failed,
      failedSamples,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Undo: delete this month's seeded subitems from every active chatter
// ---------------------------------------------------------------------------

export type UndoSeedResult =
  | { ok: true; subitemName: string; deleted: number; failed: number; chattersTouched: number }
  | { ok: false; error: string }

/**
 * Deletes every subitem on an active-chatter parent row whose name matches
 * the current month label (e.g. "June 2026"). Targets exactly what
 * bulkSeedMonthlyGradeSubitems creates, so re-running the seed after this
 * cleanup gives a fresh single-subitem-per-chatter state.
 *
 * Also removes the corresponding rows from chatter_grades so the dashboard
 * doesn't keep showing them until the next sync.
 */
export async function undoMonthlySubitemSeed(): Promise<UndoSeedResult> {
  try {
    const supabase = createAdminClient()
    const subitemName = currentMonthLabel()
    const phBoardId = process.env.MONDAY_BOARD_ID_PH
    if (!phBoardId) return { ok: false, error: 'MONDAY_BOARD_ID_PH not set' }

    // 1. Active chatters' parent item ids
    const PAGE = 1000
    type C = { monday_item_id: string }
    const all: C[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('candidates')
        .select('monday_item_id')
        .eq('current_group_title', 'ACTIVE')
        .range(from, from + PAGE - 1)
      if (error) return { ok: false, error: `Active chatter query failed: ${error.message}` }
      if (!data || data.length === 0) break
      all.push(...(data as C[]))
      if (data.length < PAGE) break
      from += PAGE
    }
    const activeParentIds = new Set(all.map(c => c.monday_item_id).filter(Boolean))
    if (activeParentIds.size === 0) {
      return { ok: false, error: 'No active chatters found' }
    }

    // 2. Pull every subitem on PH (where active chatters live), filter to
    //    those owned by an active chatter AND whose name matches this month.
    const allSubs = await fetchAllSubitems(phBoardId)
    const matches = allSubs.filter(s => activeParentIds.has(s.parent_item_id) && s.name === subitemName)

    if (matches.length === 0) {
      return { ok: true, subitemName, deleted: 0, failed: 0, chattersTouched: 0 }
    }

    // 3. Delete each on Monday. deleteItem is best-effort (caught internally).
    let deleted = 0
    let failed = 0
    const touchedParents = new Set<string>()
    const deletedIds: string[] = []
    for (const sub of matches) {
      const beforeDel = await safeDelete(sub.id)
      if (beforeDel) {
        deleted += 1
        touchedParents.add(sub.parent_item_id)
        deletedIds.push(sub.id)
      } else {
        failed += 1
      }
    }

    // 4. Clean up chatter_grades so the dashboard reflects the change immediately.
    if (deletedIds.length > 0) {
      for (let i = 0; i < deletedIds.length; i += 500) {
        const slice = deletedIds.slice(i, i + 500)
        await supabase.from('chatter_grades').delete().in('monday_item_id', slice)
      }
    }

    return { ok: true, subitemName, deleted, failed, chattersTouched: touchedParents.size }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function safeDelete(itemId: string): Promise<boolean> {
  try {
    await deleteItem(itemId)
    return true
  } catch {
    return false
  }
}
