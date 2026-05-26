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

export type ChatterEntry = {
  name: string
  shifts: string[]
}

export type TeamEntry = {
  team: string                // "T8"
  groupTitle: string
  pageNames: string[]         // pages the team covers (often 1, sometimes pipe-joined)
  chatters: ChatterEntry[]    // chatters live at the team level — they cover all of the team's pages
}

export type PodEntry = {
  pod: string
  teams: TeamEntry[]
  chatterCount: number
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

export async function getBoardsBreakdown(): Promise<BoardEntry[]> {
  const supabase = createAdminClient()

  // 1. Authoritative pod/team → board mapping.
  const { data: groupsRaw, error: gErr } = await supabase
    .from('board_groups')
    .select('board_name, pod, team, group_title')
  if (gErr) throw new Error(`getBoardsBreakdown (groups): ${gErr.message}`)
  type GroupRow = { board_name: string; pod: string | null; team: string | null; group_title: string }
  const podTeamToBoard = new Map<string, string>()    // key: `${pod}|${team}` → board_name
  for (const row of (groupsRaw ?? []) as GroupRow[]) {
    if (!row.pod || !row.team) continue
    podTeamToBoard.set(`${row.pod.toUpperCase()}|${row.team.toUpperCase()}`, row.board_name)
  }

  // 2. All shift rows from the chatter schedule.
  const { data: assignmentsRaw, error: aErr } = await supabase
    .from('page_assignments')
    .select('pod, team, page_name, group_title, shift_name, chatter_name')
  if (aErr) throw new Error(`getBoardsBreakdown (assignments): ${aErr.message}`)
  type Row = { pod: string | null; team: string | null; page_name: string | null; group_title: string | null; shift_name: string; chatter_name: string | null }
  const assignments = (assignmentsRaw ?? []) as Row[]

  // 3. Group by (pod, team). Chatters live at the team level, not per page —
  //    a team's chatters cover all of its pages (pipe-joined pages are shared).
  type TeamAcc = {
    pod: string
    team: string
    groupTitle: string
    pageNames: Set<string>
    chatters: Map<string, Set<string>>   // chatter → shift names
  }
  const teamMap = new Map<string, TeamAcc>()
  for (const row of assignments) {
    if (!row.pod || !row.team) continue
    const key = `${row.pod}|${row.team}`
    let acc = teamMap.get(key)
    if (!acc) {
      acc = {
        pod: row.pod,
        team: row.team,
        groupTitle: row.group_title ?? `POD ${row.pod} - ${row.team}`,
        pageNames: new Set(),
        chatters: new Map(),
      }
      teamMap.set(key, acc)
    }
    for (const pageName of splitPipeNames(row.page_name)) {
      acc.pageNames.add(pageName)
    }
    const chatter = row.chatter_name?.trim()
    if (chatter) {
      let shiftSet = acc.chatters.get(chatter)
      if (!shiftSet) {
        shiftSet = new Set()
        acc.chatters.set(chatter, shiftSet)
      }
      shiftSet.add(row.shift_name)
    }
  }

  // 4. Bucket teams by their authoritative board.
  const boardMap = new Map<string, Map<string, TeamEntry[]>>()
  for (const acc of teamMap.values()) {
    const lookupKey = `${acc.pod.toUpperCase()}|${acc.team.toUpperCase()}`
    const board = podTeamToBoard.get(lookupKey) ?? 'Unmapped'

    const chatters: ChatterEntry[] = []
    for (const [name, shiftSet] of acc.chatters) {
      chatters.push({ name, shifts: [...shiftSet].sort() })
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
      for (const t of teams) for (const c of t.chatters) podChatters.add(c.name)
      podEntries.push({ pod: podName, teams, chatterCount: podChatters.size })
    }
    podEntries.sort((a, b) => a.pod.localeCompare(b.pod))

    const boardChatters = new Set<string>()
    let pageCount = 0
    for (const p of podEntries) for (const t of p.teams) {
      pageCount += t.pageNames.length
      for (const c of t.chatters) boardChatters.add(c.name)
    }

    boards.push({
      board,
      pods: podEntries,
      podCount: podEntries.length,
      pageCount,
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

export function slugifyBoard(board: string): string {
  return board.toLowerCase().replace(/\s+/g, '-')
}

export function unslugifyBoard(slug: string): string | null {
  const lower = slug.replace(/-/g, ' ').toUpperCase()
  if (BOARD_PRIORITY.includes(lower)) return lower
  if (lower === 'UNMAPPED') return 'Unmapped'
  return null
}
