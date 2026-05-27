/**
 * Sync orchestrator: pull all Monday boards → upsert into Supabase candidates,
 * detect stage transitions, log sync run. Server-only.
 */

import { createAdminClient } from './supabase/admin'
import {
  fetchAllBoards,
  fetchBoardLayouts,
  fetchModelBoard,
  fetchPageAssignmentBoard,
  type ParsedBoardGroup,
  type ParsedItem,
  type ParsedModel,
  type ParsedPageAssignment,
} from './monday'
import { fetchRevenuePages, fetchBoardSummary, type RevenuePage, type BoardSummary } from './google_sheets'
import { detectTrack, normalizeStage, type CanonicalStage } from './stages'

export type SyncResult = {
  syncRunId: string
  candidatesSynced: number
  modelsSynced: number
  pageAssignmentsSynced: number
  boardGroupsSynced: number
  pageBoardMapSynced: number
  boardSummarySynced: number
  transitionsRecorded: number
  durationMs: number
  fetchMs: number
  upsertMs: number
  warnings: string[]
}

export async function runSync(triggeredBy: 'cron' | 'manual' | 'api' = 'manual'): Promise<SyncResult> {
  const supabase = createAdminClient()
  const startedAt = new Date()
  const warnings: string[] = []

  // Log the start of the run
  const { data: runRow, error: runErr } = await supabase
    .from('sync_runs')
    .insert({ status: 'running', triggered_by: triggeredBy })
    .select('id')
    .single()
  if (runErr) throw new Error(`Failed to create sync_run: ${runErr.message}`)
  const syncRunId = runRow.id as string

  try {
    const tFetch = Date.now()
    const [boards, modelBoard, assignmentBoard, boardLayouts, revenuePages, boardSummary] = await Promise.all([
      fetchAllBoards(),
      fetchModelBoard(),
      fetchPageAssignmentBoard(),
      // Layout sync is best-effort — if the chat-stars workspace token
      // can't reach those boards we still want the rest of the sync to land.
      fetchBoardLayouts().catch(err => {
        warnings.push(`Board layouts fetch failed: ${err instanceof Error ? err.message : String(err)}`)
        return [] as ParsedBoardGroup[]
      }),
      fetchRevenuePages().catch(err => {
        warnings.push(`Revenue tracker fetch failed: ${err instanceof Error ? err.message : String(err)}`)
        return [] as RevenuePage[]
      }),
      fetchBoardSummary().catch(err => {
        warnings.push(`Board summary fetch failed: ${err instanceof Error ? err.message : String(err)}`)
        return [] as BoardSummary[]
      }),
    ])
    const fetchMs = Date.now() - tFetch

    // Snapshot existing candidates' current_stage + stage entry time so we can detect transitions
    // and preserve stage-entered-at for unchanged candidates.
    type ExistingRow = { id: string; monday_item_id: string; current_stage: string; current_stage_entered_at: string | null }
    const existingAll: ExistingRow[] = []
    {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error: existErr } = await supabase
          .from('candidates')
          .select('id, monday_item_id, current_stage, current_stage_entered_at')
          .range(from, from + PAGE - 1)
        if (existErr) throw new Error(`Read existing failed: ${existErr.message}`)
        if (!data || data.length === 0) break
        existingAll.push(...(data as ExistingRow[]))
        if (data.length < PAGE) break
        from += PAGE
      }
    }

    const prevByMondayId = new Map<string, ExistingRow>()
    for (const c of existingAll) prevByMondayId.set(c.monday_item_id, c)

    const transitions: { candidate_id: string; from_stage: string | null; to_stage: string }[] = []
    const rowsToUpsert: Record<string, unknown>[] = []

    const nowIso = new Date().toISOString()
    for (const board of boards) {
      for (const item of board.items) {
        const stage = normalizeStage(item.group_title)
        if (!stage) {
          const msg = `Unknown Monday group "${item.group_title}" on board ${board.boardId}`
          if (!warnings.includes(msg)) warnings.push(msg)
          continue
        }
        const track = detectTrack(stage, item.group_title)
        const prev = prevByMondayId.get(item.monday_item_id)
        let stageEnteredAt: string
        if (prev) {
          if (prev.current_stage === stage) {
            // Stage unchanged — preserve existing entry if we have it, else backfill
            // using monday_updated_at (best proxy for staleness) so post-migration
            // candidates don't all look "just entered" on the first sync.
            stageEnteredAt = prev.current_stage_entered_at ?? item.monday_updated_at ?? item.monday_created_at ?? nowIso
          } else {
            // Real stage transition → entered this stage now
            stageEnteredAt = nowIso
          }
        } else {
          // New candidate to us — best guess: when the Monday item was created
          stageEnteredAt = item.monday_created_at ?? nowIso
        }
        rowsToUpsert.push(buildUpsertRow(item, stage, track, stageEnteredAt))
      }
    }

    // Chunked upsert — return ids so we don't need a second full-table read
    const tUpsert = Date.now()
    const CHUNK = 500
    const afterById = new Map<string, { id: string; current_stage: string }>()
    for (let i = 0; i < rowsToUpsert.length; i += CHUNK) {
      const slice = rowsToUpsert.slice(i, i + CHUNK)
      const { data: upserted, error: upsertErr } = await supabase
        .from('candidates')
        .upsert(slice, { onConflict: 'monday_item_id' })
        .select('id, monday_item_id, current_stage')
      if (upsertErr) throw new Error(`Upsert failed at offset ${i}: ${upsertErr.message}`)
      for (const c of upserted ?? []) {
        afterById.set(c.monday_item_id as string, c as { id: string; current_stage: string })
      }
    }
    const upsertMs = Date.now() - tUpsert

    // Detect transitions: candidates we knew before AND whose stage changed
    for (const [mondayId, after] of afterById) {
      const prev = prevByMondayId.get(mondayId)
      if (prev && prev.current_stage !== after.current_stage) {
        transitions.push({
          candidate_id: after.id,
          from_stage: prev.current_stage,
          to_stage: after.current_stage,
        })
      }
    }

    if (transitions.length > 0) {
      const { error: transErr } = await supabase.from('stage_transitions').insert(transitions)
      if (transErr) throw new Error(`Transition insert failed: ${transErr.message}`)
    }

    // Models board (separate Monday board, separate table). Skip silently if env var unset.
    let modelsSynced = 0
    if (modelBoard) {
      const modelRows = modelBoard.items.map(m => buildModelUpsertRow(m))
      for (let i = 0; i < modelRows.length; i += CHUNK) {
        const slice = modelRows.slice(i, i + CHUNK)
        const { error: modelErr } = await supabase
          .from('models')
          .upsert(slice, { onConflict: 'monday_item_id' })
        if (modelErr) throw new Error(`Model upsert failed at offset ${i}: ${modelErr.message}`)
      }
      modelsSynced = modelRows.length
    }

    // Chatter schedule board (page assignments). Drives onboarding deficit math.
    let pageAssignmentsSynced = 0
    if (assignmentBoard) {
      const rows = assignmentBoard.items.map(a => buildPageAssignmentUpsertRow(a))
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK)
        const { error: assignErr } = await supabase
          .from('page_assignments')
          .upsert(slice, { onConflict: 'monday_item_id' })
        if (assignErr) throw new Error(`Page assignment upsert failed at offset ${i}: ${assignErr.message}`)
      }
      pageAssignmentsSynced = rows.length
    }

    // Daily pipeline snapshot — write today's per-(region, stage) counts so we
    // can show day-over-day deltas in the briefing. Upserts on (date, region,
    // stage) so multiple syncs in the same day overwrite cleanly.
    {
      const todayUtc = new Date().toISOString().slice(0, 10)
      const counts = new Map<string, number>()
      for (const r of rowsToUpsert) {
        const region = r.region as string
        const stage = r.current_stage as string
        if (!region || !stage || stage === 'offboarded') continue
        const k = `${region}|${stage}`
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      const snapshotRows = [...counts.entries()].map(([k, count]) => {
        const [region, stage] = k.split('|')
        return { snapshot_date: todayUtc, region, stage, candidate_count: count }
      })
      if (snapshotRows.length > 0) {
        const { error: snapErr } = await supabase
          .from('pipeline_snapshots')
          .upsert(snapshotRows, { onConflict: 'snapshot_date,region,stage' })
        if (snapErr) warnings.push(`Pipeline snapshot upsert failed: ${snapErr.message}`)
      }
    }

    // Per-AE board layouts → authoritative pod/team → board mapping.
    let boardGroupsSynced = 0
    if (boardLayouts.length > 0) {
      const rows = boardLayouts.map(g => buildBoardGroupUpsertRow(g))
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK)
        const { error: bgErr } = await supabase
          .from('board_groups')
          .upsert(slice, { onConflict: 'monday_board_id,monday_group_id' })
        if (bgErr) throw new Error(`Board group upsert failed at offset ${i}: ${bgErr.message}`)
      }
      boardGroupsSynced = rows.length
    }

    // Page → board mapping from the revenue tracker (source of truth).
    let pageBoardMapSynced = 0
    if (revenuePages.length > 0) {
      const rows = revenuePages.map(p => ({
        page_name: p.pageName,
        board_name: p.boardName,
        agency: p.agency,
        active: p.active,
        handle: p.handle,
        inflow_username: p.inflowUsername,
        running_sales: p.runningSales,
        last_synced_at: new Date().toISOString(),
      }))
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK)
        const { error: pbErr } = await supabase
          .from('page_board_map')
          .upsert(slice, { onConflict: 'page_name' })
        if (pbErr) throw new Error(`page_board_map upsert failed at offset ${i}: ${pbErr.message}`)
      }
      pageBoardMapSynced = rows.length
    }

    // Per-board summary numbers (running sales, goal, ratio, MoM%, % to goal) from the BOARDS DATA tab.
    let boardSummarySynced = 0
    if (boardSummary.length > 0) {
      const rows = boardSummary.map(s => ({
        board_name: s.boardName,
        running_sales: s.runningSales,
        projection: s.projection,
        goal: s.goal,
        active_count: s.activeCount,
        up_count: s.upCount,
        down_count: s.downCount,
        ratio: s.ratio,
        subs_pct: s.subsPct,
        mom_pct: s.momPct,
        pct_to_goal: s.pctToGoal,
        sub_revenue: s.subRevenue,
        last_synced_at: new Date().toISOString(),
      }))
      const { error: bsErr } = await supabase
        .from('board_summary')
        .upsert(rows, { onConflict: 'board_name' })
      if (bsErr) throw new Error(`board_summary upsert failed: ${bsErr.message}`)
      boardSummarySynced = rows.length
    }

    const finishedAt = new Date()
    await supabase
      .from('sync_runs')
      .update({
        status: 'success',
        finished_at: finishedAt.toISOString(),
        candidates_synced: rowsToUpsert.length,
        transitions_recorded: transitions.length,
      })
      .eq('id', syncRunId)

    return {
      syncRunId,
      candidatesSynced: rowsToUpsert.length,
      modelsSynced,
      pageAssignmentsSynced,
      boardGroupsSynced,
      pageBoardMapSynced,
      boardSummarySynced,
      transitionsRecorded: transitions.length,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      fetchMs,
      upsertMs,
      warnings: warnings.slice(0, 50),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from('sync_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: message,
      })
      .eq('id', syncRunId)
    throw err
  }
}

function buildBoardGroupUpsertRow(g: ParsedBoardGroup): Record<string, unknown> {
  return {
    monday_board_id: g.monday_board_id,
    monday_group_id: g.monday_group_id,
    board_name: g.boardName,
    group_title: g.group_title,
    pod: g.pod,
    team: g.team,
    last_synced_at: new Date().toISOString(),
  }
}

function buildPageAssignmentUpsertRow(a: ParsedPageAssignment): Record<string, unknown> {
  return {
    monday_item_id: a.monday_item_id,
    monday_board_id: a.boardId,
    group_title: a.group_title,
    pod: a.pod,
    team: a.team,
    page_name: a.page_name,
    shift_name: a.shift_name,
    chatter_name: a.chatter_name,
    schedule_by_day: a.schedule_by_day,
    monday_created_at: a.monday_created_at,
    monday_updated_at: a.monday_updated_at,
    last_synced_at: new Date().toISOString(),
    raw_data: a.raw_data,
  }
}

function buildModelUpsertRow(m: ParsedModel): Record<string, unknown> {
  return {
    monday_item_id: m.monday_item_id,
    monday_board_id: m.boardId,
    name: m.name,
    agency: m.agency,
    page_type: m.page_type,
    revenue: m.revenue,
    start_date: m.start_date,
    board: m.board,
    ae: m.ae,
    status: m.status,
    telegram_group: m.telegram_group,
    marketing: m.marketing,
    group_title: m.group_title,
    monday_created_at: m.monday_created_at,
    monday_updated_at: m.monday_updated_at,
    last_synced_at: new Date().toISOString(),
    raw_data: m.raw_data,
  }
}

function buildUpsertRow(item: ParsedItem, stage: CanonicalStage, track: 'exp' | 'non_exp' | null, stageEnteredAt: string): Record<string, unknown> {
  return {
    monday_item_id: item.monday_item_id,
    monday_board_id: item.boardId,
    region: item.region,
    name: item.name,
    current_stage: stage,
    current_group_title: item.group_title,
    current_status: item.status_text,
    tier: item.tier,
    track,
    assigned_manager: item.assigned_manager,
    telegram: item.telegram,
    phone: item.phone,
    email: item.email,
    country: item.country,
    source: item.source,
    page_assignment: item.page_assignment,
    board_assignment: item.board_assignment,
    monday_created_at: item.monday_created_at,
    monday_updated_at: item.monday_updated_at,
    current_stage_entered_at: stageEnteredAt,
    last_synced_at: new Date().toISOString(),
    raw_data: item.raw_data,
  }
}
