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
  runningSales: number | null          // month-to-date running sales (USD)
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
 * Locates columns by header name so the parse survives column shifts in the
 * spreadsheet (new daily net columns added, columns reordered, etc).
 */
export function parseRevenueTracker(csv: string): RevenuePage[] {
  const lines = csv.split(/\r?\n/)
  const out: RevenuePage[] = []
  const seen = new Set<string>()

  // Find the header row + its column indexes.
  let headerCols: string[] | null = null
  let idx = { inflow: 0, board: 1, page: 2, handle: 3, agency: 4, active: 5, running: -1 }
  for (const line of lines) {
    if (!line || line.trim().length === 0) continue
    const cells = parseCSVRow(line)
    const lower = cells.map(c => c.trim().toLowerCase())
    if (lower.includes('inflow username') || lower.includes('teams')) {
      headerCols = cells
      const findIdx = (...needles: string[]) => {
        for (let i = 0; i < lower.length; i++) {
          if (needles.includes(lower[i])) return i
        }
        return -1
      }
      const inflow = findIdx('inflow username')
      const board = findIdx('board')
      const page = findIdx('teams')
      const handle = findIdx('@')
      const agency = findIdx('agency')
      const active = findIdx('active')
      const running = findIdx('running sales')
      idx = {
        inflow: inflow >= 0 ? inflow : 0,
        board: board >= 0 ? board : 1,
        page: page >= 0 ? page : 2,
        handle: handle >= 0 ? handle : 3,
        agency: agency >= 0 ? agency : 4,
        active: active >= 0 ? active : 5,
        running,
      }
      break
    }
  }

  for (const line of lines) {
    if (!line || line.trim().length === 0) continue
    const cells = parseCSVRow(line)
    if (cells.length < 6) continue

    // Skip the header row(s) — anything where cells[0] looks like a header label.
    const first = cells[idx.inflow]?.trim().toUpperCase() ?? ''
    if (first === 'INFLOW USERNAME' || first === 'TEAMS') continue

    const boardCell = cells[idx.board]?.trim() ?? ''
    const pageCell = cells[idx.page]?.trim() ?? ''

    // Section divider rows like ",,BOARD 1,,,,,..." — board column is blank
    // but page-name column literally says "BOARD 1" / "BOARD 2" / etc. Skip.
    if (!boardCell && /^(BOARD\s+\d+|TRAINING\s+BOARD|TOWER)$/i.test(pageCell)) continue
    if (!boardCell || !pageCell) continue

    const board = normaliseBoard(boardCell)
    if (!board) continue

    const pageName = pageCell.toUpperCase()
    if (seen.has(pageName)) continue
    seen.add(pageName)

    const runningSales = idx.running >= 0 ? parseMoney(cells[idx.running]) : null

    out.push({
      pageName,
      boardName: board,
      handle: cells[idx.handle]?.trim() || null,
      agency: cells[idx.agency]?.trim() || null,
      active: parseBool(cells[idx.active]),
      inflowUsername: cells[idx.inflow]?.trim() || null,
      runningSales,
    })
  }

  // headerCols intentionally unused beyond detection above; suppress unused-var warning
  void headerCols
  return out
}

function parseBool(raw: string | undefined): boolean | null {
  if (!raw) return null
  const upper = raw.trim().toUpperCase()
  if (upper === 'TRUE') return true
  if (upper === 'FALSE') return false
  return null
}

/** Strip $ , and whitespace, return number or null for blanks/errors. */
function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!cleaned || cleaned === '-' || /^#/.test(cleaned)) return null  // skips "#DIV/0!" etc.
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export async function fetchRevenuePages(): Promise<RevenuePage[]> {
  const csv = await fetchRevenueTrackerCsv()
  return parseRevenueTracker(csv)
}

// -------------------------------------------------------------------
// BOARDS DATA tab — pre-computed per-board summary numbers
// -------------------------------------------------------------------

export type BoardSummary = {
  boardName: string
  runningSales: number | null
  projection: number | null
  goal: number | null
  activeCount: number | null
  upCount: number | null
  downCount: number | null
  ratio: number | null
  subsPct: number | null
  momPct: number | null
  pctToGoal: number | null
  subRevenue: number | null
}

function parsePercent(raw: string | undefined): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[%\s,]/g, '')
  if (!cleaned || /^#/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n / 100 : null
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[,\s$]/g, '')
  if (!cleaned || /^#/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

async function fetchSummaryCsv(): Promise<string> {
  const sheetId = process.env.REVENUE_SHEET_ID
  if (!sheetId) throw new Error('REVENUE_SHEET_ID not set')
  const gid = process.env.REVENUE_SUMMARY_GID || '0'    // BOARDS DATA tab is the default sheet
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Revenue summary fetch HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  return await res.text()
}

export function parseBoardSummary(csv: string): BoardSummary[] {
  const lines = csv.split(/\r?\n/)
  const out: BoardSummary[] = []
  for (const line of lines) {
    if (!line || line.trim().length === 0) continue
    const cells = parseCSVRow(line)
    const name = cells[0]?.trim().toUpperCase() ?? ''
    if (!name) continue
    const board = BOARD_NORMALISE[name] ?? (name === 'TOTALS' ? 'TOTALS' : null)
    if (!board) continue
    // Layout: A=name, B=running, C=projection, D=goal, E=blank, F=active, G=up,
    // H=down, I=ratio, J=subs%, K=may/apr%, L=%-to-goal, M=sub rev
    out.push({
      boardName: board,
      runningSales: parseMoney(cells[1]),
      projection: parseMoney(cells[2]),
      goal: parseMoney(cells[3]),
      activeCount: parseNumber(cells[5]),
      upCount: parseNumber(cells[6]),
      downCount: parseNumber(cells[7]),
      ratio: parseNumber(cells[8]),
      subsPct: parsePercent(cells[9]),
      momPct: parsePercent(cells[10]),
      pctToGoal: parsePercent(cells[11]),
      subRevenue: parseMoney(cells[12]),
    })
  }
  return out
}

export async function fetchBoardSummary(): Promise<BoardSummary[]> {
  const csv = await fetchSummaryCsv()
  return parseBoardSummary(csv)
}
