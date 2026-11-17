/**
 * Blacklist guard — reusable module.
 *
 * Loads the "no-rehire" list from three sources and returns a lookup that
 * blocks anyone previously fired / offboarded / blacklisted from being
 * re-added to APPLICANTS on Monday.
 *
 * Sources merged into one lookup:
 *   1. Google Sheet: "Chatter offboard log" (14k+ rows)
 *      https://docs.google.com/spreadsheets/d/1h7KqjMJtcykSOP1YbE7QRJtMoiElGIhRfWL17YKxYKw
 *   2. Monday PH board group: OFFBOARDED   (new_group_mkmfp0tz)
 *   3. Monday PH board group: BLACKLISTED  (group_mknjjdjm)
 *
 * Match criteria (any ONE triggers a block):
 *   - email     (normalised: lowercase, trimmed)
 *   - phone     (normalised: digits only, leading 0/63 stripped)
 *   - telegram  (normalised: lowercase, strip @ / t.me/ / "I don't have" variants)
 *   - name      (normalised: lowercase, collapsed whitespace)
 *
 * USAGE:
 *   import { loadGuard } from './blacklist_guard.mjs'
 *   const guard = await loadGuard()
 *   const hit = guard.check({ email, phone, telegram, name })
 *   if (hit) { ... don't push, or send to OFFBOARDED with a BLACKLIST HIT tag }
 *
 * Requires env: MONDAY_API_TOKEN, MONDAY_BOARD_ID_PH
 */

// Two blacklist dump sheets. Columns differ between them, so each gets its
// own column-index map below. Both are merged into the same lookup tables.
const BL_SHEET_1_ID = '1h7KqjMJtcykSOP1YbE7QRJtMoiElGIhRfWL17YKxYKw' // Chatter offboard log (original)
const BL_SHEET_2_ID = '1M8gydeqJAC9mRTtTCBqs5NpIywqmz099iF7fokLYRik' // BLACKLIST HIT dump (sync_applicants writes here)
const G_OFF = 'new_group_mkmfp0tz'   // OFFBOARDED
const G_BL  = 'group_mknjjdjm'        // BLACKLISTED
const COL_EMAIL = 'email_mkmyj2e4'
const COL_TG    = 'text_mkmyfzv0'
const COL_PHONE = 'text_mkmysvvs'

// Sentinel values that mean "no real data here" — must normalize to ''.
// This list stops a placeholder like "/" from becoming a shared lookup key
// that false-matches every candidate with the same placeholder.
const JUNK_SENTINELS = new Set([
  "i don't have", "dont have", "don't have",
  "no", "na", "n/a", "none", "null", "undefined",
  "-", "—", "–", "/", "?", ".", "..", "...",
  "#error!", "#n/a", "n.a.", "nil",
  "",
])

const clean = v => (v || '').trim()
const isJunk = s => JUNK_SENTINELS.has(s) || /^[^\p{L}\p{N}]+$/u.test(s) // only punctuation = junk
export const normEmail = v => {
  const s = clean(v).toLowerCase()
  if (!s || isJunk(s)) return ''
  // Enforce real email shape — "/" or random text can't poison byEmail.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return ''
  return s
}
export const normPhone = v => clean(v).replace(/[^\d]/g, '').replace(/^0+/, '').replace(/^63/, '')
export const normTg = v => {
  let s = clean(v).toLowerCase().replace(/^@/, '').replace(/^t\.me\//, '').replace(/^https?:\/\/t\.me\//, '')
  if (isJunk(s)) return ''
  // Telegram usernames are 5-32 chars, letters/digits/underscore. Anything
  // shorter or with disallowed chars is placeholder or malformed.
  if (s.length < 5 || !/^[a-z0-9_ .-]+$/i.test(s)) return ''
  return s
}
export const normName = v => {
  const s = clean(v).toLowerCase().replace(/\s+/g, ' ')
  if (!s || isJunk(s)) return ''
  // Must be first+last (contain a space) and at least 5 chars — else too
  // generic to safely blacklist on name alone.
  if (!/\s/.test(s) || s.length < 5) return ''
  return s
}

async function fetchSheetTab(id, name) {
  const url = name
    ? `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(name)}`
    : `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&headers=1`
  const raw = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } })).text()
  const m = raw.match(/setResponse\((.*)\);?\s*$/s)
  if (!m) throw new Error('Blacklist sheet unreadable — is it shared publicly?')
  const j = JSON.parse(m[1])
  const cols = (j.table?.cols ?? []).map(c => (c.label || c.id || '').trim())
  const rows = (j.table?.rows ?? []).map(r => (r.c ?? []).map(c => (c && c.v !== null && c.v !== undefined) ? String(c.v).trim() : ''))
  return { cols, rows }
}

async function mondayQuery(query) {
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Authorization': process.env.MONDAY_API_TOKEN,
      'Content-Type': 'application/json',
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query }),
  })
  return r.json()
}

async function pageGroupFull(boardId, groupId, cols) {
  const rows = []
  let cursor = null
  const colList = cols.map(c => `"${c}"`).join(',')
  while (true) {
    const q = cursor
      ? `{ next_items_page(limit: 500, cursor: "${cursor}") { cursor items { id name column_values(ids: [${colList}]) { id text } } } }`
      : `{ boards(ids: [${boardId}]) { groups(ids: ["${groupId}"]) { items_page(limit: 500) { cursor items { id name column_values(ids: [${colList}]) { id text } } } } } }`
    const r = await mondayQuery(q)
    const page = cursor ? r.data?.next_items_page : r.data?.boards?.[0]?.groups?.[0]?.items_page
    rows.push(...(page?.items ?? []))
    cursor = page?.cursor
    if (!cursor) break
  }
  return rows
}

/**
 * Load the blacklist guard. Merges sheet + Monday OFF/BL groups into one
 * fast in-memory lookup. Call once at the start of a push script; reuse the
 * returned `check` function for every candidate.
 */
export async function loadGuard() {
  const boardId = process.env.MONDAY_BOARD_ID_PH
  if (!boardId) throw new Error('MONDAY_BOARD_ID_PH not set')
  // MONDAY_BOARD_ID_HIRING is the private HIRING PIPELINE board. During and
  // after the board split migration, OFFBOARDED + BLACKLISTED items live on
  // that board. If the env var is missing we still work — just skip it.
  const hiringBoardId = process.env.MONDAY_BOARD_ID_HIRING

  const mondayReads = [
    pageGroupFull(boardId, G_OFF, [COL_EMAIL, COL_TG, COL_PHONE]),
    pageGroupFull(boardId, G_BL,  [COL_EMAIL, COL_TG, COL_PHONE]),
  ]
  if (hiringBoardId) {
    mondayReads.push(pageGroupFull(hiringBoardId, G_OFF, [COL_EMAIL, COL_TG, COL_PHONE]))
    mondayReads.push(pageGroupFull(hiringBoardId, G_BL,  [COL_EMAIL, COL_TG, COL_PHONE]))
  }
  const [sheet1, sheet2, ...groups] = await Promise.all([
    fetchSheetTab(BL_SHEET_1_ID, ''),
    fetchSheetTab(BL_SHEET_2_ID, ''),
    ...mondayReads,
  ])
  const [chatOffItems, chatBlItems, hpOffItems = [], hpBlItems = []] = groups
  // Merge same-role items from both boards. Callers just see one unified list.
  const offItems = [...chatOffItems, ...hpOffItems]
  const blItems  = [...chatBlItems,  ...hpBlItems]

  const byEmail = new Map()
  const byPhone = new Map()
  const byTg    = new Map()
  const byName  = new Map()
  const stats = { sheet1: 0, sheet2: 0, mondayOff: 0, mondayBl: 0, byStatus: {} }

  // Per-sheet column layouts. Both sheets ship Name/Status/Telegram/Email/Phone
  // but at different positions, so each needs its own index map.
  const SHEET_MAPS = [
    { label: 'sheet1', data: sheet1, idx: { name: 0, status: 9,  tg: 10, email: 11, phone: 12 } }, // Chatter offboard log
    { label: 'sheet2', data: sheet2, idx: { name: 0, status: 10, tg: 11, email: 12, phone: 13 } }, // BLACKLIST HIT dump
  ]
  for (const { label, data, idx } of SHEET_MAPS) {
    for (const r of data.rows) {
      const name = clean(r[idx.name]); if (!name) continue
      stats[label]++
      const status = clean(r[idx.status]) || '(blank)'
      stats.byStatus[status] = (stats.byStatus[status] ?? 0) + 1
      const rec = {
        name, status, source: label,
        email: normEmail(r[idx.email]),
        phone: normPhone(r[idx.phone]),
        tg: normTg(r[idx.tg]),
      }
      const nn = normName(name)
      if (rec.email) byEmail.set(rec.email, rec)
      if (rec.phone && rec.phone.length >= 7) byPhone.set(rec.phone, rec)
      if (rec.tg) byTg.set(rec.tg, rec)
      if (nn) byName.set(nn, rec)
    }
  }

  // Group IDs candidate should land in when hit — matches where they were.
  const HOME_OFF = 'new_group_mkmfp0tz'   // OFFBOARDED
  const HOME_BL  = 'group_mknjjdjm'        // BLACKLISTED
  // Sheet-only hits (no Monday row) default to OFFBOARDED — they're historical.
  for (const rec of byEmail.values()) rec.homeGroup ??= HOME_OFF
  for (const rec of byPhone.values()) rec.homeGroup ??= HOME_OFF
  for (const rec of byTg.values()) rec.homeGroup ??= HOME_OFF
  for (const rec of byName.values()) rec.homeGroup ??= HOME_OFF

  const addMonday = (items, tagPrefix, counter, homeGroup) => {
    for (const it of items) {
      counter.value++
      const cvs = {}
      for (const cv of it.column_values ?? []) cvs[cv.id] = clean(cv.text)
      const rec = {
        name: it.name,
        status: `MONDAY ${tagPrefix}`,
        source: 'monday',
        homeGroup,
        email: normEmail(cvs[COL_EMAIL]),
        phone: normPhone(cvs[COL_PHONE]),
        tg: normTg(cvs[COL_TG]),
      }
      // Monday records override sheet records (more current + more precise routing).
      const nn = normName(it.name)
      if (rec.email) byEmail.set(rec.email, rec)
      if (rec.phone && rec.phone.length >= 7) byPhone.set(rec.phone, rec)
      if (rec.tg) byTg.set(rec.tg, rec)
      if (nn) byName.set(nn, rec)
    }
  }
  const off = { value: 0 }, bl = { value: 0 }
  addMonday(offItems, 'OFFBOARDED', off, HOME_OFF)
  addMonday(blItems, 'BLACKLISTED', bl, HOME_BL)
  stats.mondayOff = off.value
  stats.mondayBl = bl.value

  const check = ({ email, phone, telegram, name }) => {
    const e = normEmail(email), p = normPhone(phone), t = normTg(telegram), n = normName(name)
    // Order: strongest to weakest signal
    if (e && byEmail.has(e)) return { ...byEmail.get(e), via: 'email' }
    if (p && p.length >= 7 && byPhone.has(p)) return { ...byPhone.get(p), via: 'phone' }
    if (t && byTg.has(t)) return { ...byTg.get(t), via: 'telegram' }
    if (n && byName.has(n)) return { ...byName.get(n), via: 'name' }
    return null
  }

  return { check, stats, sizes: { emails: byEmail.size, phones: byPhone.size, telegrams: byTg.size, names: byName.size } }
}
