/**
 * Hierarchical breakdown of pods + teams + pages + chatters, grouped by AE board.
 *
 * Source of truth for which (pod, team) belongs to which board: the
 * `board_groups` table — synced from the 4 AE board layouts on Monday
 * (BOARD 1 / 2 / 3 / TRAINING BOARD), whose groups are named "POD A TEAM 1"
 * etc. We *don't* infer from candidate.board_assignment any more because
 * that drifts.
 *
 * Source of pages + chatters per team: the `page_assignments` table
 * (chatter schedule board).
 */

import { createAdminClient } from './supabase/admin'
import { parsePageGroupTitle, parseBoardGroup } from './monday'

export type ShiftSlot = {
  shiftName: string                             // "MORNING SHIFT"
  scheduleByDay: Record<string, string | null>  // Monday → "3am-11am EST", ...
}

export type ChatterEntry = {
  name: string
  shifts: string[]
  slots: ShiftSlot[]
  manager: string | null                        // assigned_manager from candidates table
}

export type TeamEntry = {
  team: string                // "T8"
  groupTitle: string
  pageNames: string[]
  chatters: ChatterEntry[]
}

export type PodEntry = {
  pod: string
  teams: TeamEntry[]
  chatterCount: number
  manager: string | null      // most common manager across the pod's chatters
}

export type BoardEntry = {
  board: string
  pods: PodEntry[]
  podCount: number
  pageCount: number
  chatterCount: number
}

const BOARD_PRIORITY = ['BOARD 1', 'BOARD 2', 'BOARD 3', 'TRAINING BOARD']

function splitPipeNames(pageNameRaw: string | null): string[] {
  if (!pageNameRaw) return []
  return pageNameRaw.split('|').map(s => s.trim()).filter(Boolean)
}

/** Monday's Chatter (People) column returns multi-assignees as "A, B, C". Split them. */
export function splitChatterNames(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export async function getBoardsBreakdown(): Promise<BoardEntry[]> {
  const supabase = createAdminClient()

  // 1. Authoritative pod/team → board mapping. Re-parse at read time so the
  //    flexible parser logic applies without waiting on a fresh sync.
  const { data: groupsRaw, error: gErr } = await supabase
    .from('board_groups')
    .select('board_name, pod, team, group_title')
  if (gErr) throw new Error(`getBoardsBreakdown (groups): ${gErr.message}`)
  type GroupRow = { board_name: string; pod: string | null; team: string | null; group_title: string }
  const podTeamToBoard = new Map<string, string>()    // key: `${pod}|${team}` → board_name
  for (const row of (groupsRaw ?? []) as GroupRow[]) {
    const reparsed = parseBoardGroup(row.group_title)
    const pod = (reparsed.pod ?? row.pod)?.toUpperCase() ?? null
    const team = (reparsed.team ?? row.team)?.toUpperCase() ?? null
    if (!pod || !team) continue
    podTeamToBoard.set(`${pod}|${team}`, row.board_name)
  }

  // 1b. Build name → assigned_manager map from candidates (so we can label each chatter with their manager).
  const chatterToManager = new Map<string, string>()
  {
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('candidates')
        .select('name, assigned_manager')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`getBoardsBreakdown (candidates): ${error.message}`)
      if (!data || data.length === 0) break
      for (const c of data as { name: string; assigned_manager: string | null }[]) {
        if (c.assigned_manager && !chatterToManager.has(c.name)) {
          chatterToManager.set(c.name, c.assigned_manager)
        }
      }
      if (data.length < PAGE) break
      from += PAGE
    }
  }

  // 2. All shift rows from the chatter schedule.
  const { data: assignmentsRaw, error: aErr } = await supabase
    .from('page_assignments')
    .select('pod, team, page_name, group_title, shift_name, chatter_name, schedule_by_day')
  if (aErr) throw new Error(`getBoardsBreakdown (assignments): ${aErr.message}`)
  type Row = { pod: string | null; team: string | null; page_name: string | null; group_title: string | null; shift_name: string; chatter_name: string | null; schedule_by_day: Record<string, string | null> | null }
  const assignments = (assignmentsRaw ?? []) as Row[]

  // 3. Group by (pod, team). Chatters live at the team level, not per page —
  //    a team's chatters cover all of its pages (pipe-joined pages are shared).
  type ChatterAcc = { shifts: Set<string>; slots: Map<string, Record<string, string | null>> }
  type TeamAcc = {
    pod: string
    team: string
    groupTitle: string
    pageNames: Set<string>
    chatters: Map<string, ChatterAcc>
  }
  const teamMap = new Map<string, TeamAcc>()
  for (const row of assignments) {
    // Re-parse at read time so we don't depend on the older parser baked into existing rows.
    const reparsed = parsePageGroupTitle(row.group_title)
    const pod = (reparsed.pod ?? row.pod)?.toUpperCase()
    const team = (reparsed.team ?? row.team)?.toUpperCase()
    const pageNameForRow = reparsed.page_name ?? row.page_name
    if (!pod || !team) continue
    const key = `${pod}|${team}`
    let acc = teamMap.get(key)
    if (!acc) {
      acc = {
        pod,
        team,
        groupTitle: row.group_title ?? `POD ${pod} - ${team}`,
        pageNames: new Set(),
        chatters: new Map(),
      }
      teamMap.set(key, acc)
    }
    for (const pageName of splitPipeNames(pageNameForRow)) {
      acc.pageNames.add(pageName)
    }
    for (const chatter of splitChatterNames(row.chatter_name)) {
      let chatterAcc = acc.chatters.get(chatter)
      if (!chatterAcc) {
        chatterAcc = { shifts: new Set(), slots: new Map() }
        acc.chatters.set(chatter, chatterAcc)
      }
      chatterAcc.shifts.add(row.shift_name)
      if (!chatterAcc.slots.has(row.shift_name)) {
        chatterAcc.slots.set(row.shift_name, row.schedule_by_day ?? {})
      }
    }
  }

  // 4. Bucket teams by their authoritative board.
  const boardMap = new Map<string, Map<string, TeamEntry[]>>()
  for (const acc of teamMap.values()) {
    const lookupKey = `${acc.pod.toUpperCase()}|${acc.team.toUpperCase()}`
    const board = podTeamToBoard.get(lookupKey) ?? 'Unmapped'

    const chatters: ChatterEntry[] = []
    for (const [name, chatterAcc] of acc.chatters) {
      const slots: ShiftSlot[] = [...chatterAcc.slots.entries()].map(([shiftName, scheduleByDay]) => ({ shiftName, scheduleByDay }))
      slots.sort((a, b) => shiftOrder(a.shiftName) - shiftOrder(b.shiftName))
      chatters.push({
        name,
        shifts: [...chatterAcc.shifts].sort(),
        slots,
        manager: chatterToManager.get(name) ?? null,
      })
    }
    chatters.sort((a, b) => a.name.localeCompare(b.name))

    const teamEntry: TeamEntry = {
      team: acc.team,
      groupTitle: acc.groupTitle,
      pageNames: [...acc.pageNames].sort(),
      chatters,
    }

    let pods = boardMap.get(board)
    if (!pods) {
      pods = new Map()
      boardMap.set(board, pods)
    }
    const arr = pods.get(acc.pod) ?? []
    arr.push(teamEntry)
    pods.set(acc.pod, arr)
  }

  // 5. Also include boards from board_groups that have *no* current chatter
  //    schedule activity, so they still appear as empty cards.
  for (const [board] of new Set([...podTeamToBoard.values()].map(b => [b, b]))) {
    if (!boardMap.has(board)) boardMap.set(board, new Map())
  }

  // 6. Materialise BoardEntry[]
  const boards: BoardEntry[] = []
  for (const [board, pods] of boardMap) {
    const podEntries: PodEntry[] = []
    for (const [podName, teams] of pods) {
      teams.sort((a, b) => a.team.localeCompare(b.team, undefined, { numeric: true }))
      const podChatters = new Set<string>()
      const managerVotes = new Map<string, number>()
      for (const t of teams) for (const c of t.chatters) {
        podChatters.add(c.name)
        if (c.manager) managerVotes.set(c.manager, (managerVotes.get(c.manager) ?? 0) + 1)
      }
      // Majority-vote manager — falls back to null if no chatter has one
      let bestManager: string | null = null
      let bestVotes = 0
      for (const [m, v] of managerVotes) {
        if (v > bestVotes) { bestManager = m; bestVotes = v }
      }
      podEntries.push({ pod: podName, teams, chatterCount: podChatters.size, manager: bestManager })
    }
    podEntries.sort((a, b) => a.pod.localeCompare(b.pod))

    const boardChatters = new Set<string>()
    const boardPages = new Set<string>()
    for (const p of podEntries) for (const t of p.teams) {
      for (const pageName of t.pageNames) boardPages.add(pageName)
      for (const c of t.chatters) boardChatters.add(c.name)
    }

    boards.push({
      board,
      pods: podEntries,
      podCount: podEntries.length,
      pageCount: boardPages.size,
      chatterCount: boardChatters.size,
    })
  }

  boards.sort((a, b) => {
    const ra = rankBoard(a.board)
    const rb = rankBoard(b.board)
    if (ra !== rb) return ra - rb
    return a.board.localeCompare(b.board)
  })

  return boards
}

function rankBoard(board: string): number {
  const idx = BOARD_PRIORITY.indexOf(board.toUpperCase())
  return idx === -1 ? BOARD_PRIORITY.length + 1 : idx
}

const SHIFT_ORDER = ['MORNING', 'DAY', 'NIGHT', 'FILLER']
export function shiftOrder(shiftName: string): number {
  const upper = shiftName.toUpperCase()
  const idx = SHIFT_ORDER.findIndex(s => upper.includes(s))
  return idx === -1 ? SHIFT_ORDER.length + 1 : idx
}

export function slugifyBoard(board: string): string {
  return board.toLowerCase().replace(/\s+/g, '-')
}

export function unslugifyBoard(slug: string): string | null {
  const lower = slug.replace(/-/g, ' ').toUpperCase()
  if (BOARD_PRIORITY.includes(lower)) return lower
  if (lower === 'UNMAPPED') return 'Unmapped'
  return null
}

// ---------------------------------------------------------------------------
// Debug: surface what's actually in board_groups + which chatter-schedule
// (pod, team) values are unmapped so the operator can see why training board
// or "Tower team" content didn't land where expected.
// ---------------------------------------------------------------------------

export type BoardLayoutDebugRow = {
  boardName: string
  groupTitle: string
  pod: string | null
  team: string | null
}

export type UnmappedTeam = {
  pod: string
  team: string
  groupTitle: string
  pageNames: string[]
  chatterCount: number
}

export type UnparseableGroup = {
  groupTitle: string
  rowCount: number
  chatterSample: string[]   // first few chatter names from this group, for visual confirmation
}

export async function getBoardsDebug(): Promise<{
  layoutRows: BoardLayoutDebugRow[]
  unmappedTeams: UnmappedTeam[]
  unparseableGroups: UnparseableGroup[]
}> {
  const supabase = createAdminClient()

  // Layout rows from board_groups — re-parse at read time
  const { data: layoutRaw } = await supabase
    .from('board_groups')
    .select('board_name, group_title, pod, team')
    .order('board_name')
    .order('group_title')
  const layoutRows: BoardLayoutDebugRow[] = ((layoutRaw ?? []) as { board_name: string; group_title: string; pod: string | null; team: string | null }[])
    .map(r => {
      const re = parseBoardGroup(r.group_title)
      return { boardName: r.board_name, groupTitle: r.group_title, pod: re.pod ?? r.pod, team: re.team ?? r.team }
    })

  const lookup = new Map<string, string>()
  for (const r of layoutRows) {
    if (r.pod && r.team) lookup.set(`${r.pod.toUpperCase()}|${r.team.toUpperCase()}`, r.boardName)
  }

  // Chatter-schedule rows — re-parse, then bucket: matched (skip), unmapped (pod+team but no board), unparseable (no pod or no team).
  const { data: assignRaw } = await supabase
    .from('page_assignments')
    .select('pod, team, page_name, group_title, chatter_name')
  type Row = { pod: string | null; team: string | null; page_name: string | null; group_title: string | null; chatter_name: string | null }
  const teamAcc = new Map<string, { pod: string; team: string; groupTitle: string; pageNames: Set<string>; chatters: Set<string> }>()
  const unparseableAcc = new Map<string, { rowCount: number; chatters: Set<string> }>()

  for (const r of (assignRaw ?? []) as Row[]) {
    const reparsed = parsePageGroupTitle(r.group_title)
    const pod = (reparsed.pod ?? r.pod)?.toUpperCase()
    const team = (reparsed.team ?? r.team)?.toUpperCase()
    if (!pod || !team) {
      const title = r.group_title ?? '(no title)'
      let acc = unparseableAcc.get(title)
      if (!acc) {
        acc = { rowCount: 0, chatters: new Set() }
        unparseableAcc.set(title, acc)
      }
      acc.rowCount += 1
      for (const c of splitChatterNames(r.chatter_name)) acc.chatters.add(c)
      continue
    }
    const k = `${pod}|${team}`
    let acc = teamAcc.get(k)
    if (!acc) {
      acc = { pod, team, groupTitle: r.group_title ?? '', pageNames: new Set(), chatters: new Set() }
      teamAcc.set(k, acc)
    }
    for (const p of splitPipeNames(reparsed.page_name ?? r.page_name)) acc.pageNames.add(p)
    for (const c of splitChatterNames(r.chatter_name)) acc.chatters.add(c)
  }

  const unmappedTeams: UnmappedTeam[] = []
  for (const acc of teamAcc.values()) {
    if (lookup.has(`${acc.pod}|${acc.team}`)) continue
    unmappedTeams.push({
      pod: acc.pod,
      team: acc.team,
      groupTitle: acc.groupTitle,
      pageNames: [...acc.pageNames].sort(),
      chatterCount: acc.chatters.size,
    })
  }
  unmappedTeams.sort((a, b) => `${a.pod}${a.team}`.localeCompare(`${b.pod}${b.team}`))

  const unparseableGroups: UnparseableGroup[] = [...unparseableAcc.entries()].map(([groupTitle, acc]) => ({
    groupTitle,
    rowCount: acc.rowCount,
    chatterSample: [...acc.chatters].slice(0, 5),
  })).sort((a, b) => b.rowCount - a.rowCount)

  return { layoutRows, unmappedTeams, unparseableGroups }
}
