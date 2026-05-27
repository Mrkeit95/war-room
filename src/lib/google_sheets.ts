/**
 * Pulls the Stellar OPS revenue tracker (Google Sheet) via its public CSV
 * export endpoint. Sheet must be shared "anyone with the link can view".
 * No API key needed — we just fetch the CSV and parse it.
 *
 * Env:
 *   REVENUE_SHEET_ID   — the spreadsheet id (the long string in the URL)
 *   REVENUE_SHEET_GID  — the gid of the per-page tab (the number after #gid=)
 */

export type RevenuePage = {
  pageName: string
  boardName: string                    // normalised: "BOARD 1", "BOARD 2", "BOARD 3", "TRAINING BOARD", "TOWER"
  agency: string | null
  active: boolean | null
  handle: string | null
  inflowUsername: string | null
}

const BOARD_NORMALISE: Record<string, string> = {
  'BOARD 1': 'BOARD 1',
  'BOARD 2': 'BOARD 2',
  'BOARD 3': 'BOARD 3',
  'TRAINING BOARD': 'TRAINING BOARD',
  'TOWER': 'TOWER',
}

function normaliseBoard(raw: string | null | undefined): string | null {
  if (!raw) return null
  const upper = raw.trim().toUpperCase()
  return BOARD_NORMALISE[upper] ?? null
}

/** Parse one CSV line (handles quoted fields with embedded commas). */
function parseCSVRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else if (ch === ',') {
      cells.push(current)
      current = ''
    } else if (ch === '"') {
      inQuotes = true
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

export async function fetchRevenueTrackerCsv(): Promise<string> {
  const sheetId = process.env.REVENUE_SHEET_ID
  const gid = process.env.REVENUE_SHEET_GID
  if (!sheetId) throw new Error('REVENUE_SHEET_ID not set')
  if (!gid) throw new Error('REVENUE_SHEET_GID not set')
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Revenue sheet fetch HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  return await res.text()
}

/**
 * Parse the per-page tab of the revenue tracker into page → board records.
 * Skips header rows, empty rows, and any "BOARD X" section divider rows.
 */
export function parseRevenueTracker(csv: string): RevenuePage[] {
  // Split on \r?\n but preserve quoted newlines (unlikely in this data; we'll
  // be optimistic about a row-per-line layout).
  const lines = csv.split(/\r?\n/)
  const out: RevenuePage[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (!line || line.trim().length === 0) continue
    const cells = parseCSVRow(line)
    if (cells.length < 6) continue

    // Skip header row (it has "INFLOW USERNAME" or "TEAMS" labels)
    const first = cells[0]?.trim().toUpperCase() ?? ''
    if (first === 'INFLOW USERNAME' || first === 'TEAMS') continue

    const boardCell = cells[1]?.trim() ?? ''
    const pageCell = cells[2]?.trim() ?? ''

    // Section divider rows like ",,BOARD 1,,,,,..." — board column is blank
    // but page-name column literally says "BOARD 1" / "BOARD 2" / etc. Skip.
    if (!boardCell && /^(BOARD\s+\d+|TRAINING\s+BOARD|TOWER)$/i.test(pageCell)) continue
    if (!boardCell || !pageCell) continue

    const board = normaliseBoard(boardCell)
    if (!board) continue   // unknown board label

    const pageName = pageCell.toUpperCase()
    if (seen.has(pageName)) continue   // dedupe across the sheet
    seen.add(pageName)

    out.push({
      pageName,
      boardName: board,
      handle: cells[3]?.trim() || null,
      agency: cells[4]?.trim() || null,
      active: parseBool(cells[5]),
      inflowUsername: cells[0]?.trim() || null,
    })
  }

  return out
}

function parseBool(raw: string | undefined): boolean | null {
  if (!raw) return null
  const upper = raw.trim().toUpperCase()
  if (upper === 'TRUE') return true
  if (upper === 'FALSE') return false
  return null
}

export async function fetchRevenuePages(): Promise<RevenuePage[]> {
  const csv = await fetchRevenueTrackerCsv()
  return parseRevenueTracker(csv)
}
