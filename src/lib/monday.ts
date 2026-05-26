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
