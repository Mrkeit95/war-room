/**
 * Hierarchical breakdown of the chatter schedule (page_assignments) joined
 * with candidate board_assignment, so we can answer: "for BOARD 1, which
 * pods exist, what pages do they cover, and who's on them?"
 *
 * Source of truth for which board a team belongs to: the board_assignment
 * column on the chatters themselves (candidates table). That's the most
 * reliable signal — chatters are already routed to a board.
 */

import { createAdminClient } from './supabase/admin'

export type ChatterEntry = {
  name: string
  shifts: string[]            // shift names this chatter covers, e.g. ["MORNING SHIFT", "FILLER SHIFT"]
}

export type PageEntry = {
  pageName: string            // matches models.name when possible
  chatters: ChatterEntry[]
}

export type TeamEntry = {
  team: string                // "T8"
  groupTitle: string          // full Monday group title, kept for debugging
  pages: PageEntry[]
  chatterCount: number        // total unique chatters in the team
}

export type PodEntry = {
  pod: string                 // "C"
  teams: TeamEntry[]
  chatterCount: number
}

export type BoardEntry = {
  board: string               // "BOARD 1" / "BOARD 2" / "BOARD 3" / "TRAINING BOARD" / "Unassigned"
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

  // 1. All page-assignment rows
  const { data: assignmentsRaw, error: aErr } = await supabase
    .from('page_assignments')
    .select('pod, team, page_name, group_title, shift_name, chatter_name')
  if (aErr) throw new Error(`getBoardsBreakdown: ${aErr.message}`)
  type Row = { pod: string | null; team: string | null; page_name: string | null; group_title: string | null; shift_name: string; chatter_name: string | null }
  const assignments = (assignmentsRaw ?? []) as Row[]

  // 2. Look up which board each chatter belongs to (board_assignment on candidates).
  const chatterNames = [...new Set(
    assignments.map(a => a.chatter_name?.trim()).filter((s): s is string => !!s)
  )]
  const chatterToBoard = new Map<string, string>()
  if (chatterNames.length > 0) {
    const PAGE = 500
    for (let i = 0; i < chatterNames.length; i += PAGE) {
      const slice = chatterNames.slice(i, i + PAGE)
      const { data: candidates, error: cErr } = await supabase
        .from('candidates')
        .select('name, board_assignment')
        .in('name', slice)
      if (cErr) throw new Error(`getBoardsBreakdown (candidates): ${cErr.message}`)
      for (const c of (candidates ?? []) as { name: string; board_assignment: string | null }[]) {
        const b = c.board_assignment?.trim()
        if (b) chatterToBoard.set(c.name, b)
      }
    }
  }

  // 3. Group rows by (pod, team). For each team, determine its board from chatter votes.
  type TeamAcc = {
    pod: string
    team: string
    groupTitle: string
    pages: Map<string, Map<string, Set<string>>>   // pageName → chatterName → set of shift names
    boardVotes: Map<string, number>
  }
  const teamMap = new Map<string, TeamAcc>()   // key: `${pod}|${team}`

  for (const row of assignments) {
    if (!row.pod || !row.team) continue
    const key = `${row.pod}|${row.team}`
    let acc = teamMap.get(key)
    if (!acc) {
      acc = {
        pod: row.pod,
        team: row.team,
        groupTitle: row.group_title ?? `POD ${row.pod} - ${row.team}`,
        pages: new Map(),
        boardVotes: new Map(),
      }
      teamMap.set(key, acc)
    }

    const pageNames = splitPipeNames(row.page_name)
    if (pageNames.length === 0) pageNames.push('(unnamed page)')
    const chatter = row.chatter_name?.trim()

    for (const pageName of pageNames) {
      let pageChatters = acc.pages.get(pageName)
      if (!pageChatters) {
        pageChatters = new Map()
        acc.pages.set(pageName, pageChatters)
      }
      if (chatter) {
        let shiftSet = pageChatters.get(chatter)
        if (!shiftSet) {
          shiftSet = new Set()
          pageChatters.set(chatter, shiftSet)
        }
        shiftSet.add(row.shift_name)
      }
    }

    if (chatter) {
      const board = chatterToBoard.get(chatter)
      if (board) {
        acc.boardVotes.set(board, (acc.boardVotes.get(board) ?? 0) + 1)
      }
    }
  }

  // 4. Materialise team entries with their inferred board.
  type TeamWithBoard = { board: string; team: TeamEntry }
  const teamsWithBoard: TeamWithBoard[] = []
  for (const acc of teamMap.values()) {
    // Pick the board with the most votes; tie-breaker prefers BOARD 1/2/3/TRAINING order.
    let bestBoard: string | null = null
    let bestVotes = -1
    for (const [board, votes] of acc.boardVotes) {
      if (votes > bestVotes || (votes === bestVotes && rankBoard(board) < rankBoard(bestBoard ?? ''))) {
        bestVotes = votes
        bestBoard = board
      }
    }
    const board = bestBoard ?? 'Unassigned'

    const pages: PageEntry[] = []
    const teamChatters = new Set<string>()
    for (const [pageName, chatterMap] of acc.pages) {
      const chatters: ChatterEntry[] = []
      for (const [name, shiftSet] of chatterMap) {
        chatters.push({ name, shifts: [...shiftSet].sort() })
        teamChatters.add(name)
      }
      chatters.sort((a, b) => a.name.localeCompare(b.name))
      pages.push({ pageName, chatters })
    }
    pages.sort((a, b) => a.pageName.localeCompare(b.pageName))

    teamsWithBoard.push({
      board,
      team: {
        team: acc.team,
        groupTitle: acc.groupTitle,
        pages,
        chatterCount: teamChatters.size,
      },
    })
  }

  // 5. Group teams by board → pod.
  const boardMap = new Map<string, Map<string, TeamEntry[]>>()   // board → pod → teams[]
  for (const { board, team } of teamsWithBoard) {
    let pods = boardMap.get(board)
    if (!pods) {
      pods = new Map()
      boardMap.set(board, pods)
    }
    // We need the pod from the original acc — recompute from team's pageName via groupTitle parse
    const podMatch = team.groupTitle.match(/POD\s+(\S+)/i)
    const pod = podMatch ? podMatch[1].toUpperCase() : '—'
    const arr = pods.get(pod) ?? []
    arr.push(team)
    pods.set(pod, arr)
  }

  // 6. Materialise board entries.
  const boards: BoardEntry[] = []
  for (const [board, pods] of boardMap) {
    const podEntries: PodEntry[] = []
    let chatterCount = 0
    let pageCount = 0
    for (const [podName, teams] of pods) {
      teams.sort((a, b) => a.team.localeCompare(b.team, undefined, { numeric: true }))
      const podChatters = new Set<string>()
      let podPages = 0
      for (const t of teams) {
        podPages += t.pages.length
        for (const p of t.pages) {
          for (const c of p.chatters) podChatters.add(c.name)
        }
      }
      podEntries.push({ pod: podName, teams, chatterCount: podChatters.size })
      pageCount += podPages
      // Note: chatters can span pods — we still count unique per pod and let the board aggregate be approximate
    }
    podEntries.sort((a, b) => a.pod.localeCompare(b.pod))

    const boardChatters = new Set<string>()
    for (const p of podEntries) for (const t of p.teams) for (const pg of t.pages) for (const c of pg.chatters) boardChatters.add(c.name)
    chatterCount = boardChatters.size

    boards.push({
      board,
      pods: podEntries,
      podCount: podEntries.length,
      pageCount,
      chatterCount,
    })
  }

  // Sort: BOARD 1, 2, 3, TRAINING BOARD, then anything else alphabetically.
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
  // Match against known boards
  if (BOARD_PRIORITY.includes(lower)) return lower
  if (lower === 'UNASSIGNED') return 'Unassigned'
  return null
}
