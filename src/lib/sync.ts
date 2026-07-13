/**
 * Sync orchestrator: pull all Monday boards → upsert into Supabase candidates,
 * detect stage transitions, log sync run. Server-only.
 */

import { createAdminClient } from './supabase/admin'
import {
  fetchAllBoards,
  fetchAllGradingSubitems,
  fetchBoardLayouts,
  fetchModelBoard,
  fetchPageAssignmentBoard,
  type ParsedBoardGroup,
  type ParsedGrade,
  type ParsedItem,
  type ParsedModel,
  type ParsedPageAssignment,
} from './monday'
import { fetchRevenuePages, fetchBoardSummary, type RevenuePage, type BoardSummary } from './google_sheets'
import { computeAndWriteBackGrades } from './grading_writeback'
import { detectTrack, normalizeStage, type CanonicalStage } from './stages'

export type SyncResult = {
  syncRunId: string
  candidatesSynced: number
  modelsSynced: number
  pageAssignmentsSynced: number
  boardGroupsSynced: number
  pageBoardMapSynced: number
  boardSummarySynced: number
  chatterGradesSynced: number
  gradesWrittenBack: number
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
    const [boards, modelBoard, assignmentBoard, boardLayouts, revenuePages, boardSummary, gradingSubitems] = await Promise.all([
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
      fetchAllGradingSubitems().catch(err => {
        warnings.push(`Grading subitems fetch failed: ${err instanceof Error ? err.message : String(err)}`)
        return [] as { region: 'PH' | 'EU' | 'SA'; subitems: ParsedGrade[] }[]
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

    // ─── Ghost pruning ───
    // Candidates that used to be on Monday but no longer are (deleted/archived) accumulate
    // as ghosts in Supabase because upsert never removes rows. Anything whose last_synced_at
    // is older than "this run started" is a ghost — mark it offboarded so it drops out of
    // pipeline counts/alerts/AI context.
    // Safety: only prune within a region if the sync successfully fetched candidates from
    // that region's board (don't wipe a region because its board fetch quietly returned 0).
    const seenIdsByRegion = new Map<string, Set<string>>()
    for (const board of boards) {
      const set = seenIdsByRegion.get(board.region) ?? new Set<string>()
      for (const item of board.items) set.add(item.monday_item_id)
      seenIdsByRegion.set(board.region, set)
    }
    const ghostTransitions: { candidate_id: string; from_stage: string; to_stage: string }[] = []
    let ghostsPruned = 0
    for (const [region, seenIds] of seenIdsByRegion) {
      if (seenIds.size === 0) {
        warnings.push(`Ghost prune skipped for ${region}: 0 items fetched from Monday`)
        continue
      }
      // Everything in DB for this region that wasn't in this sync's snapshot AND isn't already offboarded.
      const ghosts = existingAll.filter(e => !seenIds.has(e.monday_item_id) && e.current_stage !== 'offboarded')
      // Cross-check against region — need to filter by region. existingAll doesn't have region loaded,
      // fetch just the ids we care about with their region for the guardrail.
      if (ghosts.length === 0) continue
      const ghostIds = ghosts.map(g => g.id)
      const { data: ghostRows, error: ghostFetchErr } = await supabase
        .from('candidates')
        .select('id, monday_item_id, region, current_stage')
        .in('id', ghostIds)
        .eq('region', region)
      if (ghostFetchErr) {
        warnings.push(`Ghost fetch failed for ${region}: ${ghostFetchErr.message}`)
        continue
      }
      const regionGhosts = (ghostRows ?? []) as { id: string; monday_item_id: string; region: string; current_stage: string }[]
      if (regionGhosts.length === 0) continue
      // Safety cap: if >30% of the region would be pruned, something's probably wrong — skip and warn.
      const regionTotal = existingAll.filter(e => {
        // We don't have region on existingAll, approximate by ghosts + seen. This over-estimates the base
        // but is conservative (harder to trip the safety cap).
        return true
      }).length
      const cap = Math.max(50, Math.floor(seenIds.size * 0.30))
      if (regionGhosts.length > cap) {
        warnings.push(`Ghost prune skipped for ${region}: would prune ${regionGhosts.length} (>30% of ${seenIds.size} synced) — likely sync fetched partial data`)
        continue
      }
      // Mark as offboarded
      const { error: pruneErr } = await supabase
        .from('candidates')
        .update({
          current_stage: 'offboarded',
          current_group_title: 'OFFBOARDED (removed from Monday)',
          last_synced_at: new Date().toISOString(),
        })
        .in('id', regionGhosts.map(g => g.id))
      if (pruneErr) {
        warnings.push(`Ghost prune update failed for ${region}: ${pruneErr.message}`)
        continue
      }
      // Record transitions so weekly reports show the movement
      for (const g of regionGhosts) {
        if (g.current_stage !== 'offboarded') {
          ghostTransitions.push({ candidate_id: g.id, from_stage: g.current_stage, to_stage: 'offboarded' })
        }
      }
      ghostsPruned += regionGhosts.length
    }
    if (ghostTransitions.length > 0) {
      const { error: ghostTransErr } = await supabase.from('stage_transitions').insert(ghostTransitions)
      if (ghostTransErr) warnings.push(`Ghost transition insert failed: ${ghostTransErr.message}`)
    }
    if (ghostsPruned > 0) {
      warnings.push(`Pruned ${ghostsPruned} ghost candidates (no longer on Monday)`)
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

    // Chatter grading subitems → upsert into chatter_grades.
    let chatterGradesSynced = 0
    if (gradingSubitems.length > 0) {
      const allRows: Record<string, unknown>[] = []
      const parentToCandidateId = new Map<string, string>()
      for (const { region, subitems } of gradingSubitems) {
        for (const s of subitems) {
          allRows.push({
            monday_item_id: s.monday_item_id,
            monday_parent_item_id: s.parent_item_id,
            region: region,
            subitem_name: s.subitem_name,
            grader: s.grader,
            ppv_captions: s.ppv_captions,
            sexting_message_quality: s.sexting_message_quality,
            hooks_opening_lines: s.hooks_opening_lines,
            reply_time: s.reply_time,
            golden_ratio: s.golden_ratio,
            persona_match: s.persona_match,
            whale_handling: s.whale_handling,
            english_skills: s.english_skills,
            reliability: s.reliability,
            sales_generated_dollars: s.sales_generated_dollars,
            monday_created_at: s.monday_created_at,
            monday_updated_at: s.monday_updated_at,
            last_synced_at: new Date().toISOString(),
          })
        }
      }
      // Resolve candidate_id by parent_item_id (so the modal can join easily later)
      const parentIds = [...new Set(allRows.map(r => r.monday_parent_item_id as string))]
      if (parentIds.length > 0) {
        const PAGE = 500
        for (let i = 0; i < parentIds.length; i += PAGE) {
          const slice = parentIds.slice(i, i + PAGE)
          const { data: candidatesFound } = await supabase
            .from('candidates')
            .select('id, monday_item_id')
            .in('monday_item_id', slice)
          for (const c of (candidatesFound ?? []) as { id: string; monday_item_id: string }[]) {
            parentToCandidateId.set(c.monday_item_id, c.id)
          }
        }
      }
      for (const row of allRows) {
        const pid = row.monday_parent_item_id as string
        if (parentToCandidateId.has(pid)) row.candidate_id = parentToCandidateId.get(pid)
      }
      for (let i = 0; i < allRows.length; i += CHUNK) {
        const slice = allRows.slice(i, i + CHUNK)
        const { error: gErr } = await supabase
          .from('chatter_grades')
          .upsert(slice, { onConflict: 'monday_item_id' })
        if (gErr) warnings.push(`chatter_grades upsert failed at offset ${i}: ${gErr.message}`)
      }
      chatterGradesSynced = allRows.length
    }

    // Compute composite + trajectory + latest sales per chatter, then push back
    // to Monday parent rows. Best-effort — warnings only on failure.
    let gradesWrittenBack = 0
    try {
      gradesWrittenBack = await computeAndWriteBackGrades(gradingSubitems, warnings)
    } catch (err) {
      warnings.push(`Grade write-back failed: ${err instanceof Error ? err.message : String(err)}`)
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
      chatterGradesSynced,
      gradesWrittenBack,
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
