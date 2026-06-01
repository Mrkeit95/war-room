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
function findCol(item: { column_values: MondayColumnValue[] }, ...titles: string[]): MondayColumnValue | undefined {
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

// ---------------------------------------------------------------------------
// Grading subitems — each chatter row on a region board has nested grading
// subitems with the 9 rating columns + Grader + Sales Generated $.
// ---------------------------------------------------------------------------

export type GradingSubitemRaw = {
  id: string
  name: string
  parent_item_id: string
  created_at: string | null
  updated_at: string | null
  column_values: MondayColumnValue[]
}

const SUBITEM_FIELDS = `
  id
  name
  created_at
  updated_at
  column_values {
    id
    text
    column { title }
  }
`

/**
 * Pull every subitem under every item on a board, paginated. Uses Monday's
 * `next_items_page` to walk through items and reads their subitems inline.
 */
export async function fetchAllSubitems(boardId: string): Promise<GradingSubitemRaw[]> {
  const items: { id: string; subitems: GradingSubitemRaw[] }[] = []
  let cursor: string | null = null
  const limit = 100

  const firstQuery = `
    query ($boardId: ID!, $limit: Int!) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit) {
          cursor
          items {
            id
            subitems { ${SUBITEM_FIELDS} }
          }
        }
      }
    }
  `
  type FirstResp = { boards: [{ items_page: { cursor: string | null; items: { id: string; subitems: GradingSubitemRaw[] }[] } }] }
  const first = await mondayGraphQL<FirstResp>(firstQuery, { boardId, limit })
  for (const it of first.boards[0].items_page.items) items.push(it)
  cursor = first.boards[0].items_page.cursor

  const nextQuery = `
    query ($cursor: String!, $limit: Int!) {
      next_items_page(cursor: $cursor, limit: $limit) {
        cursor
        items {
          id
          subitems { ${SUBITEM_FIELDS} }
        }
      }
    }
  `
  while (cursor) {
    type NextResp = { next_items_page: { cursor: string | null; items: { id: string; subitems: GradingSubitemRaw[] }[] } }
    const next = await mondayGraphQL<NextResp>(nextQuery, { cursor, limit })
    for (const it of next.next_items_page.items) items.push(it)
    cursor = next.next_items_page.cursor
  }

  // Flatten to subitems with parent reference
  const all: GradingSubitemRaw[] = []
  for (const it of items) {
    for (const sub of it.subitems ?? []) {
      all.push({ ...sub, parent_item_id: it.id })
    }
  }
  return all
}

export type ParsedGrade = {
  monday_item_id: string                // the subitem's own id
  parent_item_id: string                // chatter's main row id
  region: RegionCode
  subitem_name: string                  // e.g. "Week 23 · Apple"
  grader: string | null
  ppv_captions: number | null
  sexting_message_quality: number | null
  hooks_opening_lines: number | null
  reply_time: number | null
  golden_ratio: number | null
  persona_match: number | null
  whale_handling: number | null
  english_skills: number | null
  reliability: number | null
  sales_generated_dollars: number | null
  monday_created_at: string | null
  monday_updated_at: string | null
}

function parseRating(cv: MondayColumnValue | undefined): number | null {
  if (!cv?.text) return null
  // Monday Rating columns return text like "5" or "4.5"
  const n = parseFloat(cv.text)
  return Number.isFinite(n) && n >= 0 && n <= 5 ? n : null
}

function parseNumber(cv: MondayColumnValue | undefined): number | null {
  if (!cv?.text) return null
  const cleaned = cv.text.replace(/[,\s$]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

export function parseGradingSubitem(raw: GradingSubitemRaw, region: RegionCode): ParsedGrade {
  return {
    monday_item_id: raw.id,
    parent_item_id: raw.parent_item_id,
    region,
    subitem_name: raw.name,
    grader: textOf(findCol(raw, 'Grader', 'Owner')),
    ppv_captions: parseRating(findCol(raw, 'PPV captions')),
    sexting_message_quality: parseRating(findCol(raw, 'Sexting / Message Quality', 'Sexting/ Message Quality', 'Sexting / Message quality')),
    hooks_opening_lines: parseRating(findCol(raw, 'Hooks & Opening lines', 'Hooks and Opening lines')),
    reply_time: parseRating(findCol(raw, 'Reply time')),
    golden_ratio: parseRating(findCol(raw, 'Golden Ratio', 'Golden ratio')),
    persona_match: parseRating(findCol(raw, 'Persona Match', 'Persona match')),
    whale_handling: parseRating(findCol(raw, 'Whale Handling', 'Whale handling')),
    english_skills: parseRating(findCol(raw, 'English Skills', 'English skills')),
    reliability: parseRating(findCol(raw, 'Reliability')),
    sales_generated_dollars: parseNumber(findCol(raw, 'Sales Generated $', 'Sales Generated')),
    monday_created_at: raw.created_at,
    monday_updated_at: raw.updated_at,
  }
}

export async function fetchAllGradingSubitems(): Promise<{ region: RegionCode; subitems: ParsedGrade[] }[]> {
  const config = getBoardConfig()
  return Promise.all(config.map(async ({ region, boardId }) => {
    const raws = await fetchAllSubitems(boardId)
    return { region, subitems: raws.map(r => parseGradingSubitem(r, region)) }
  }))
}

// ---------------------------------------------------------------------------
// Write-back helpers for parent grading columns
// ---------------------------------------------------------------------------

/** Set a Number column value on a Monday item. Value is the raw number as string. */
export async function setNumberColumnValue(boardId: string, itemId: string, columnId: string, value: number | null): Promise<void> {
  const query = `
    mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
        id
      }
    }
  `
  await mondayGraphQL(query, {
    boardId,
    itemId,
    columnId,
    value: JSON.stringify(value === null ? '' : String(value)),
  })
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
  // Pod token is alphanumeric only. A stray "-" right after the pod (e.g.
  // "POD A-" instead of "POD A") gets absorbed by the optional dash separator
  // before the team, so "POD A-" and "POD A" collapse to the same pod.
  const m = title.match(/^POD\s+([A-Z0-9]+)\s*[-—]*\s*(?:TEAM\s+|T)(\d+)\s*(.*)$/i)
  if (m) {
    const page = (m[3] ?? '').trim()
    return {
      pod: m[1].toUpperCase(),
      team: `T${m[2]}`,
      page_name: page.length > 0 ? page.toUpperCase() : null,
    }
  }
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

// ---------------------------------------------------------------------------
// Mutations — write back to Monday
// ---------------------------------------------------------------------------

/**
 * Fetch the column id for a given column title on a board. Monday's update
 * mutations require the column id, not the title, and we don't store it
 * anywhere yet.
 */
export async function findColumnId(boardId: string, ...titles: string[]): Promise<string | null> {
  const query = `
    query ($boardId: ID!) {
      boards(ids: [$boardId]) { columns { id title } }
    }
  `
  type Resp = { boards: [{ columns: { id: string; title: string }[] }] }
  const data = await mondayGraphQL<Resp>(query, { boardId })
  const lowered = titles.map(t => t.toLowerCase())
  const match = data.boards[0]?.columns.find(c => lowered.includes(c.title.toLowerCase()))
  return match?.id ?? null
}

/**
 * Set a Status-column value on a Monday item to the given label.
 * Monday's status columns require JSON like `{"label": "ACTIVE"}`. The label
 * must already exist in the column's options.
 */
export async function setStatusColumnValue(boardId: string, itemId: string, columnId: string, label: string): Promise<void> {
  const query = `
    mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
        id
      }
    }
  `
  await mondayGraphQL(query, {
    boardId,
    itemId,
    columnId,
    value: JSON.stringify({ label }),
  })
}

// ---------------------------------------------------------------------------
// Column replication — for copying the grading column structure across boards
// ---------------------------------------------------------------------------

export type ColumnDetail = { id: string; title: string; type: string; settings_str: string | null }

export async function fetchBoardColumnsDetailed(boardId: string): Promise<ColumnDetail[]> {
  const query = `
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        columns { id title type settings_str }
      }
    }
  `
  type Resp = { boards: [{ columns: ColumnDetail[] }] }
  const data = await mondayGraphQL<Resp>(query, { boardId })
  return data.boards[0]?.columns ?? []
}

/**
 * Create a new column on a board. For status/dropdown/numeric/rating/people/etc.
 * defaultsJson is the JSON-serialised settings object — usually copied verbatim
 * from a source column's settings_str when replicating.
 */
export async function createColumn(args: {
  boardId: string
  title: string
  columnType: string                // 'status' | 'dropdown' | 'numeric' | 'rating' | 'people' | 'long_text' | ...
  defaultsJson?: string | null      // settings to pass through, or null
}): Promise<{ id: string; title: string }> {
  const query = `
    mutation ($boardId: ID!, $title: String!, $columnType: ColumnType!, $defaults: JSON) {
      create_column(board_id: $boardId, title: $title, column_type: $columnType, defaults: $defaults) {
        id
        title
      }
    }
  `
  type Resp = { create_column: { id: string; title: string } }
  const data = await mondayGraphQL<Resp>(query, {
    boardId: args.boardId,
    title: args.title,
    columnType: args.columnType,
    defaults: args.defaultsJson ?? null,
  })
  return data.create_column
}

/**
 * Get the subitem board id for a main board, if any. Monday creates a parallel
 * "sub-board" the first time a subitem is added; before that, there's no id.
 */
export async function getSubitemBoardId(mainBoardId: string): Promise<string | null> {
  // Strategy: the `subtasks` (or `subitems`) column on the main board stores
  // the subitem board id in its settings_str as `boardIds`. If no such column
  // or no boardIds, subitems aren't initialised yet.
  const columns = await fetchBoardColumnsDetailed(mainBoardId)
  const subCol = columns.find(c => c.type === 'subtasks' || c.type === 'subitems' || c.title?.toLowerCase() === 'subitems')
  if (!subCol?.settings_str) return null
  try {
    const settings = JSON.parse(subCol.settings_str) as { boardIds?: (string | number)[] }
    const first = settings.boardIds?.[0]
    return first != null ? String(first) : null
  } catch {
    return null
  }
}

/** Create one placeholder subitem on the first available item — used to initialise subitems on a fresh board. */
export async function createPlaceholderSubitem(parentItemId: string, name = 'placeholder'): Promise<string | null> {
  const query = `
    mutation ($parentItemId: ID!, $itemName: String!) {
      create_subitem(parent_item_id: $parentItemId, item_name: $itemName) { id }
    }
  `
  try {
    type Resp = { create_subitem: { id: string } }
    const data = await mondayGraphQL<Resp>(query, { parentItemId, itemName: name })
    return data.create_subitem.id
  } catch {
    return null
  }
}

/** Find the first item on a board to use as a parent for the placeholder subitem. */
export async function findFirstItemId(boardId: string): Promise<string | null> {
  const query = `
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 1) { items { id } }
      }
    }
  `
  type Resp = { boards: [{ items_page: { items: { id: string }[] } }] }
  const data = await mondayGraphQL<Resp>(query, { boardId })
  return data.boards[0]?.items_page?.items?.[0]?.id ?? null
}

/** Delete an item (used to clean up the placeholder subitem after column replication). */
export async function deleteItem(itemId: string): Promise<void> {
  const query = `
    mutation ($itemId: ID!) {
      delete_item(item_id: $itemId) { id }
    }
  `
  try { await mondayGraphQL(query, { itemId }) } catch { /* best-effort cleanup */ }
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
