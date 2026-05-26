/**
 * Minimal Monday.com GraphQL client + item-to-Candidate parser.
 * Service-only (server-side). Never import into client components.
 */

const MONDAY_API_URL = 'https://api.monday.com/v2'
const API_VERSION = '2024-10'

export type MondayColumnValue = {
  id: string
  text: string | null
  column: { title: string }
}

export type MondayItem = {
  id: string
  name: string
  group: { id: string; title: string } | null
  created_at: string | null
  updated_at: string | null
  column_values: MondayColumnValue[]
}

export type RegionCode = 'PH' | 'EU' | 'SA' | 'UK'

export const BOARD_REGIONS: Record<string, RegionCode> = {} // populated at runtime from env

function getBoardConfig(): { region: RegionCode; boardId: string }[] {
  const map: Record<RegionCode, string | undefined> = {
    PH: process.env.MONDAY_BOARD_ID_PH,
    EU: process.env.MONDAY_BOARD_ID_EU,
    SA: process.env.MONDAY_BOARD_ID_SA,
    UK: process.env.MONDAY_BOARD_ID_UK,
  }
  const config: { region: RegionCode; boardId: string }[] = []
  for (const [region, boardId] of Object.entries(map) as [RegionCode, string | undefined][]) {
    if (!boardId) continue
    config.push({ region, boardId })
    BOARD_REGIONS[boardId] = region
  }
  return config
}

async function mondayGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = process.env.MONDAY_API_TOKEN
  if (!token) throw new Error('MONDAY_API_TOKEN not set')

  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
      'API-Version': API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Monday API HTTP ${res.status}: ${text}`)
  }

  const json = await res.json()
  if (json.errors) {
    throw new Error(`Monday API error: ${JSON.stringify(json.errors)}`)
  }
  return json.data as T
}

// Only `text` is queried (not the raw `value` JSON) — `value` is large
// (doc/file/integration columns) and we only ever read `text`. Keeps the
// PH board fetch fast.
const ITEM_FIELDS = `
  id
  name
  created_at
  updated_at
  group { id title }
  column_values {
    id
    text
    column { title }
  }
`

/**
 * Fetch every item in a board, paginated.
 * Returns full array — call sites should be ok with up to a few thousand items.
 */
export async function fetchAllItems(boardId: string): Promise<MondayItem[]> {
  const items: MondayItem[] = []
  let cursor: string | null = null
  const limit = 500 // Monday's max page size — keeps the full sync well under Vercel's function timeout

  // First page
  const firstQuery = `
    query ($boardId: ID!, $limit: Int!) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit) {
          cursor
          items { ${ITEM_FIELDS} }
        }
      }
    }
  `
  type FirstResp = { boards: [{ items_page: { cursor: string | null; items: MondayItem[] } }] }
  const first = await mondayGraphQL<FirstResp>(firstQuery, { boardId, limit })
  items.push(...first.boards[0].items_page.items)
  cursor = first.boards[0].items_page.cursor

  // Subsequent pages use next_items_page (cursor-only, board not needed)
  const nextQuery = `
    query ($cursor: String!, $limit: Int!) {
      next_items_page(cursor: $cursor, limit: $limit) {
        cursor
        items { ${ITEM_FIELDS} }
      }
    }
  `
  while (cursor) {
    type NextResp = { next_items_page: { cursor: string | null; items: MondayItem[] } }
    const next = await mondayGraphQL<NextResp>(nextQuery, { cursor, limit })
    items.push(...next.next_items_page.items)
    cursor = next.next_items_page.cursor
  }

  return items
}

/**
 * Helpers for extracting fields from column_values.
 */
function findCol(item: MondayItem, ...titles: string[]): MondayColumnValue | undefined {
  return item.column_values.find(cv => titles.some(t => cv.column.title.toLowerCase() === t.toLowerCase()))
}

function textOf(cv: MondayColumnValue | undefined): string | null {
  if (!cv) return null
  const t = cv.text
  return t && t.length > 0 ? t : null
}

export type ParsedItem = {
  boardId: string
  monday_item_id: string
  region: RegionCode
  name: string
  group_title: string | null
  status_text: string | null
  tier: string | null
  assigned_manager: string | null
  telegram: string | null
  phone: string | null
  email: string | null
  country: string | null
  source: string | null
  page_assignment: string | null
  board_assignment: string | null
  monday_created_at: string | null
  monday_updated_at: string | null
  raw_data: MondayItem
}

export function parseItem(item: MondayItem, boardId: string, region: RegionCode): ParsedItem {
  const status = findCol(item, 'Status')
  const tier = findCol(item, 'Tier')
  const person = findCol(item, 'Assigned to', 'Assigned To')
  const telegram = findCol(item, 'Telegram')
  const phone = findCol(item, 'Phone Number', 'Phone number', 'Phone')
  const email = findCol(item, 'Email')
  const country = findCol(item, 'Country')
  const source = findCol(item, 'Source')
  const pageAssignment = findCol(item, 'Page Assignment')
  const board = findCol(item, 'BOARD', 'Board')

  return {
    boardId,
    monday_item_id: item.id,
    region,
    name: item.name,
    group_title: item.group?.title ?? null,
    status_text: textOf(status),
    tier: textOf(tier),
    assigned_manager: textOf(person),
    telegram: textOf(telegram),
    phone: textOf(phone),
    email: textOf(email),
    country: textOf(country),
    source: textOf(source),
    page_assignment: textOf(pageAssignment),
    board_assignment: textOf(board),
    monday_created_at: item.created_at,
    monday_updated_at: item.updated_at,
    raw_data: item,
  }
}

export async function fetchAllBoards(): Promise<{ region: RegionCode; boardId: string; items: ParsedItem[] }[]> {
  const config = getBoardConfig()
  // Fetch all 4 boards in parallel — they're independent
  return Promise.all(
    config.map(async ({ region, boardId }) => {
      const items = await fetchAllItems(boardId)
      const parsed = items.map(it => parseItem(it, boardId, region))
      return { region, boardId, items: parsed }
    })
  )
}

/**
 * Model onboarding board (separate from the 4 region chatter boards).
 * Tracks pages we onboard, not chatters. Revenue → team math is handled in
 * lib/models.ts; this is just the parser.
 */
export type ParsedModel = {
  boardId: string
  monday_item_id: string
  name: string
  agency: string | null
  page_type: string | null
  revenue: number | null
  start_date: string | null      // YYYY-MM-DD
  board: string | null           // BOARD 1 / 2 / 3
  ae: string | null
  status: string | null          // PENDING / ACTIVE / ...
  telegram_group: string | null
  marketing: string | null
  group_title: string | null
  monday_created_at: string | null
  monday_updated_at: string | null
  raw_data: MondayItem
}

function parseRevenue(text: string | null): number | null {
  if (!text) return null
  // Strip $, commas, whitespace. Handles "$80,000", "80000", "$9.5k" → 9500.
  const cleaned = text.replace(/[\s,$]/g, '').toLowerCase()
  if (!cleaned) return null
  const kMatch = cleaned.match(/^([\d.]+)k$/)
  if (kMatch) {
    const n = parseFloat(kMatch[1])
    return Number.isFinite(n) ? n * 1000 : null
  }
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseDate(text: string | null): string | null {
  if (!text) return null
  // Monday date column .text comes in like "2026-06-22" already, or sometimes "Jun 22".
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export function parseModelItem(item: MondayItem, boardId: string): ParsedModel {
  const agency = findCol(item, 'AGENCY (GM)', 'AGENCY', 'Agency')
  const pageType = findCol(item, 'PAGE TYPE (GM)', 'PAGE TYPE', 'Page Type')
  const revenue = findCol(item, 'REVENUE (GM)', 'REVENUE', 'Revenue')
  const startDate = findCol(item, 'START DATE (GM)', 'START DATE', 'Start Date')
  const board = findCol(item, 'BOARD (VP)', 'BOARD', 'Board')
  const ae = findCol(item, 'AEs (GM)', 'AEs', 'AE')
  const status = findCol(item, 'STATUS (AE)', 'STATUS', 'Status')
  const telegram = findCol(item, 'TELEGRAM GROUP', 'Telegram Group', 'TELEGRAM GRO...')
  const marketing = findCol(item, 'MARKETING', 'Marketing')

  return {
    boardId,
    monday_item_id: item.id,
    name: item.name,
    agency: textOf(agency),
    page_type: textOf(pageType),
    revenue: parseRevenue(textOf(revenue)),
    start_date: parseDate(textOf(startDate)),
    board: textOf(board),
    ae: textOf(ae),
    status: textOf(status),
    telegram_group: textOf(telegram),
    marketing: textOf(marketing),
    group_title: item.group?.title ?? null,
    monday_created_at: item.created_at,
    monday_updated_at: item.updated_at,
    raw_data: item,
  }
}

export async function fetchModelBoard(): Promise<{ boardId: string; items: ParsedModel[] } | null> {
  const boardId = process.env.MONDAY_BOARD_ID_MODELS
  if (!boardId) return null
  const items = await fetchAllItems(boardId)
  return { boardId, items: items.map(it => parseModelItem(it, boardId)) }
}

/**
 * Chatter schedule board. Each Monday group = a page ("POD C - T8 CHINKERBELL"),
 * each item = a shift slot with one chatter assigned.
 */
export type ParsedPageAssignment = {
  boardId: string
  monday_item_id: string
  group_title: string | null
  pod: string | null
  team: string | null
  page_name: string | null
  shift_name: string
  chatter_name: string | null
  schedule_by_day: Record<string, string | null>   // Monday → "3am-11am EST", "OFF", ...
  monday_created_at: string | null
  monday_updated_at: string | null
  raw_data: MondayItem
}

const SCHEDULE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/**
 * Parse a chatter-schedule group title into pod / team / page name. Accepts:
 *   "POD C - T8 CHINKERBELL"        (canonical: with dash)
 *   "POD J T1 PAGE NAME"            (no dash)
 *   "POD J TEAM 1 PAGE NAME"        (TEAM word instead of T#)
 *   "POD J - TEAM 1 PAGE | OTHER"   (dash + TEAM word + pipe pages)
 *
 * Pod is the token right after "POD"; team is normalised to "T<digits>";
 * page name is whatever comes after the team token.
 */
export function parsePageGroupTitle(title: string | null): { pod: string | null; team: string | null; page_name: string | null } {
  if (!title) return { pod: null, team: null, page_name: null }
  // Combined match: pod letter, optional dash, team (T# or TEAM #), rest of string.
  const m = title.match(/^POD\s+(\S+)\s*[-—]?\s*(?:TEAM\s+|T)(\d+)\s*(.*)$/i)
  if (m) {
    const page = (m[3] ?? '').trim()
    return {
      pod: m[1].toUpperCase(),
      team: `T${m[2]}`,
      page_name: page.length > 0 ? page.toUpperCase() : null,
    }
  }
  // Fallback: no pod/team detected — surface the whole title as the page label
  return { pod: null, team: null, page_name: title.trim().toUpperCase() || null }
}

export function parsePageAssignmentItem(item: MondayItem, boardId: string): ParsedPageAssignment {
  const chatter = findCol(item, 'Chatter', 'CHATTER')
  const { pod, team, page_name } = parsePageGroupTitle(item.group?.title ?? null)
  const schedule_by_day: Record<string, string | null> = {}
  for (const day of SCHEDULE_DAYS) {
    schedule_by_day[day] = textOf(findCol(item, day, day.toUpperCase()))
  }
  return {
    boardId,
    monday_item_id: item.id,
    group_title: item.group?.title ?? null,
    pod,
    team,
    page_name,
    shift_name: item.name,
    chatter_name: textOf(chatter),
    schedule_by_day,
    monday_created_at: item.created_at,
    monday_updated_at: item.updated_at,
    raw_data: item,
  }
}

export async function fetchPageAssignmentBoard(): Promise<{ boardId: string; items: ParsedPageAssignment[] } | null> {
  const boardId = process.env.MONDAY_BOARD_ID_ASSIGNMENTS
  if (!boardId) return null
  const items = await fetchAllItems(boardId)
  return { boardId, items: items.map(it => parsePageAssignmentItem(it, boardId)) }
}

/**
 * Per-AE board layout. Each board's groups are named "POD A TEAM 1" — that's
 * the authoritative pod/team → board mapping. IDs are fixed (chat-stars
 * workspace) but can be overridden via env vars if anything moves.
 */
const BOARD_LAYOUT: { name: string; envVar: string; defaultId: string }[] = [
  { name: 'BOARD 1', envVar: 'MONDAY_BOARD_ID_BOARD_1', defaultId: '8870944166' },
  { name: 'BOARD 2', envVar: 'MONDAY_BOARD_ID_BOARD_2', defaultId: '8870885000' },
  { name: 'BOARD 3', envVar: 'MONDAY_BOARD_ID_BOARD_3', defaultId: '8870544469' },
  { name: 'TRAINING BOARD', envVar: 'MONDAY_BOARD_ID_TRAINING', defaultId: '8461825186' },
]

export type ParsedBoardGroup = {
  boardName: string
  monday_board_id: string
  monday_group_id: string
  group_title: string
  pod: string | null
  team: string | null
}

/**
 * Parse pod + team out of a group title. Accepts every variant we've seen so
 * far:
 *   "POD A TEAM 1"          (AE board layouts)
 *   "POD A - T1 PAGE NAME"  (chatter schedule, with dash + page)
 *   "POD A T1 PAGE NAME"    (chatter schedule, no dash)
 *   "POD J TEAM 1 PAGE"     (chatter schedule, TEAM word)
 *
 * The pod token can be a letter ("A".."Z") or short string; the team is
 * normalised to "T<digits>".
 */
export function parseBoardGroup(title: string | null): { pod: string | null; team: string | null } {
  if (!title) return { pod: null, team: null }
  const podMatch = title.match(/POD\s+([A-Z0-9]+)/i)
  const teamMatch = title.match(/(?:TEAM\s+|\bT)(\d+)\b/i)
  return {
    pod: podMatch ? podMatch[1].toUpperCase() : null,
    team: teamMatch ? `T${teamMatch[1]}` : null,
  }
}

export async function fetchBoardLayouts(): Promise<ParsedBoardGroup[]> {
  const boards = BOARD_LAYOUT.map(b => ({ name: b.name, id: process.env[b.envVar] || b.defaultId }))
  // Single GraphQL call gets all 4 boards' groups
  const query = `
    query ($boardIds: [ID!]) {
      boards(ids: $boardIds) {
        id
        groups { id title }
      }
    }
  `
  type Resp = { boards: { id: string; groups: { id: string; title: string }[] }[] }
  const data = await mondayGraphQL<Resp>(query, { boardIds: boards.map(b => b.id) })

  const out: ParsedBoardGroup[] = []
  for (const b of data.boards) {
    const layout = boards.find(x => x.id === b.id)
    if (!layout) continue
    for (const g of b.groups) {
      const { pod, team } = parseBoardGroup(g.title)
      out.push({
        boardName: layout.name,
        monday_board_id: b.id,
        monday_group_id: g.id,
        group_title: g.title,
        pod,
        team,
      })
    }
  }
  return out
}
