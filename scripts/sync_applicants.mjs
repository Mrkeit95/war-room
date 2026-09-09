#!/usr/bin/env node
/**
 * Canonical script for syncing Meta ad leads → Monday PH board.
 *
 * FLOW every time it runs:
 *   1. Load applicant sheet (Main + Inexperienced tabs)
 *   2. Dedupe by email
 *   3. Load blacklist guard (14k+ sheet rows + Monday OFFBOARDED + BLACKLISTED)
 *   4. Load current APPLICANTS groups on Monday (dedupe against them)
 *   5. For each new candidate:
 *        - Detect shift-by-1 in the Inexperienced tab (fix if needed)
 *        - Classify EXP vs NON-EXP by "time since" field
 *        - Guard check: email / phone / telegram / name against blacklist
 *          → hit: land in OFFBOARDED with source tag `BLACKLIST HIT (…)`
 *          → miss: land in APPLICANTS (C) Exp or APPLICANTS (C) Non Exp
 *   6. Populate columns + post full Q&A as Update
 *
 * USAGE:
 *   node --env-file=.env.local scripts/sync_applicants.mjs         # push
 *   node --env-file=.env.local scripts/sync_applicants.mjs --dry   # dry run (no writes)
 *
 * Requires env: MONDAY_API_TOKEN, MONDAY_BOARD_ID_PH
 */

import { loadGuard, normEmail, normPhone, normTg, normName } from './blacklist_guard.mjs'

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run')

// Config
const APP_SHEET_ID = '1eNMcOJ_ypz4B-Thj1F54ZBoZam9_VOW-XX4s1bWo4T4'  // Meta lead ad sheet
const MON = process.env.MONDAY_API_TOKEN
const PH  = process.env.MONDAY_BOARD_ID_PH
const G_EXP = 'group_mm6wk20'         // APPLICANTS (C) Exp
const G_NEX = 'group_mm6tcv2t'        // APPLICANTS (C) Non Exp
const G_OFF = 'new_group_mkmfp0tz'    // OFFBOARDED (blacklist hits land here by default)
const G_BL  = 'group_mknjjdjm'        // BLACKLISTED (blacklist hits land here if that's where they were)
const G_PCT = 'group_mm6htkjn'        // PENDING CHAT TRIAL (legacy dedupe target)
const COL = {
  source:'text_mknf4048', telegram:'text_mkmyfzv0', email:'email_mkmyj2e4',
  phone:'text_mkmysvvs', country:'text_mkmy8ag1', discord:'text_mm57381d',
}

// ─── Sheet loading ─────────────────────────────────────────────────
async function fetchTab(name) {
  const url = name
    ? `https://docs.google.com/spreadsheets/d/${APP_SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(name)}`
    : `https://docs.google.com/spreadsheets/d/${APP_SHEET_ID}/gviz/tq?tqx=out:json&headers=1`
  const raw = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } })).text()
  const m = raw.match(/setResponse\((.*)\);?\s*$/s)
  const j = JSON.parse(m[1])
  const cols = (j.table?.cols ?? []).map(c => (c.label || c.id || '').trim())
  const rows = (j.table?.rows ?? []).map(r => (r.c ?? []).map(c => (c && c.v !== null && c.v !== undefined) ? String(c.v).trim() : ''))
  return { cols, rows }
}

const clean = v => (v || '').trim()
const findIdx = (cols, ...pats) => {
  const h = cols.map(c => c.toLowerCase())
  for (const p of pats) { const i = h.findIndex(c => c === p.toLowerCase()); if (i !== -1) return i }
  for (const p of pats) { const i = h.findIndex(c => c.includes(p.toLowerCase())); if (i !== -1) return i }
  return -1
}

const HOURS_RE   = /^(40\+|20.?40|10.?20|Under 10)$/i
const ENGLISH_RE = /^(Fluent|Native|Conversational|Basic)$/i

function extractRow(row, cols, tabName) {
  const IDX = {
    email: findIdx(cols, 'email'), first: findIdx(cols, 'first name'), last: findIdx(cols, 'last name'),
    phone: findIdx(cols, 'phone'), country: findIdx(cols, 'country'),
    english: findIdx(cols, 'english'), hours: findIdx(cols, 'hours'),
    telegram: findIdx(cols, 'telegram'), discord: findIdx(cols, 'discord'),
    prevExp: findIdx(cols, 'prior experience'),
    timeSince: findIdx(cols, 'how long has it been'),
    history: findIdx(cols, 'explain your history'),
    startSoon: findIdx(cols, 'how soon'),
    why: findIdx(cols, 'why do you think'),
    utmSrc: findIdx(cols, 'utm source'), utmMed: findIdx(cols, 'utm medium'),
    date: findIdx(cols, 'response time'),
  }
  const g = i => (i >= 0 && row[i]) ? row[i].trim() : ''

  const eng = g(IDX.english), hrs = g(IDX.hours), tg = g(IDX.telegram)
  const first = g(IDX.first), last = g(IDX.last), phone = g(IDX.phone), country = g(IDX.country)
  // Shift-by-1 detection: entire row shifted right by 1.
  // Trigger on either (a) first-name slot empty while last-name slot has content,
  // or (b) hours-col holds English value AND telegram-col holds Hours value.
  const shifted = (!first && last) || (ENGLISH_RE.test(hrs) && HOURS_RE.test(tg))
  if (shifted) {
    return {
      email: g(IDX.email).toLowerCase(),
      first: last,                    // last-slot → real first
      last: phone,                    // phone-slot → real last
      phone: country,                 // country-slot → real phone
      country: eng,                   // english-slot → real country
      english: hrs, hours: tg,
      telegram: g(IDX.discord),
      discord: g(IDX.prevExp),
      prevExp: g(IDX.timeSince), timeSince: g(IDX.history), history: g(IDX.startSoon),
      startSoon: g(IDX.why), why: '',
      utmSrc: g(IDX.utmSrc), utmMed: g(IDX.utmMed),
      date: g(IDX.date), tab: tabName, shifted: true,
    }
  }
  return {
    email: g(IDX.email).toLowerCase(), first: g(IDX.first), last: g(IDX.last),
    phone: g(IDX.phone), country: g(IDX.country),
    english: eng, hours: hrs, telegram: tg, discord: g(IDX.discord),
    prevExp: g(IDX.prevExp), timeSince: g(IDX.timeSince), history: g(IDX.history),
    startSoon: g(IDX.startSoon), why: g(IDX.why),
    utmSrc: g(IDX.utmSrc), utmMed: g(IDX.utmMed),
    date: g(IDX.date), tab: tabName, shifted: false,
  }
}

// ─── Monday helpers ────────────────────────────────────────────────
const M = (q, v) => fetch('https://api.monday.com/v2', {
  method: 'POST',
  headers: { 'Authorization': MON, 'Content-Type': 'application/json', 'API-Version': '2024-10' },
  body: JSON.stringify({ query: q, variables: v }),
}).then(r => r.json())

async function pageGroup(gid) {
  const rows = []
  let cursor = null
  while (true) {
    const q = cursor
      ? `{ next_items_page(limit: 500, cursor: "${cursor}") { cursor items { id name column_values(ids: ["${COL.email}"]) { text } } } }`
      : `{ boards(ids: [${PH}]) { groups(ids: ["${gid}"]) { items_page(limit: 500) { cursor items { id name column_values(ids: ["${COL.email}"]) { text } } } } } }`
    const r = await M(q, {})
    const page = cursor ? r.data?.next_items_page : r.data?.boards?.[0]?.groups?.[0]?.items_page
    rows.push(...(page?.items ?? []))
    cursor = page?.cursor
    if (!cursor) break
  }
  return rows
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(DRY ? '── DRY RUN (no writes) ──\n' : '── LIVE PUSH ──\n')

  console.log('Loading applicant sheet…')
  const [main, inex] = await Promise.all([fetchTab(''), fetchTab('Inexperienced')])
  const mainLeads = main.rows.filter(r => r[0]).map(r => extractRow(r, main.cols, 'main'))
  const inLeads   = inex.rows.filter(r => r[0]).map(r => extractRow(r, inex.cols, 'inex'))
  const seen = new Set()
  const all = [...mainLeads, ...inLeads].filter(l => { if (!l.email) return false; if (seen.has(l.email)) return false; seen.add(l.email); return true })
  console.log(`  ${mainLeads.length} main + ${inLeads.length} inex = ${all.length} unique emails\n`)

  console.log('Loading blacklist guard…')
  const guard = await loadGuard()
  console.log(`  ${guard.stats.sheet} sheet rows + ${guard.stats.mondayOff} monday-off + ${guard.stats.mondayBl} monday-bl`)
  console.log(`  lookup sizes: ${guard.sizes.emails} emails, ${guard.sizes.phones} phones, ${guard.sizes.telegrams} tgs, ${guard.sizes.names} names\n`)

  console.log('Loading Monday state (Applicants + PCT + OFFBOARDED + BLACKLISTED + FILTERED for dedupe)…')
  // NB: dedup MUST include OFFBOARDED + BLACKLISTED + FILTERED. Otherwise:
  //   - guard-caught leads get duplicated in OFFBOARDED every cron run
  //   - when the operator temporarily moves items to FILTERED to trigger email
  //     recipes, the cron sees them "missing" from dedup and re-creates them
  const G_FILTERED = 'group_mm6xv03r'
  const [inExp, inNex, inPct, inOff, inBl, inFilt] = await Promise.all([
    pageGroup(G_EXP), pageGroup(G_NEX), pageGroup(G_PCT),
    pageGroup(G_OFF), pageGroup(G_BL), pageGroup(G_FILTERED),
  ])
  const monEmails = new Set([...inExp, ...inNex, ...inPct, ...inOff, ...inBl, ...inFilt].map(i => (i.column_values?.[0]?.text ?? '').toLowerCase().trim()).filter(Boolean))
  const monNames  = new Set([...inExp, ...inNex, ...inPct, ...inOff, ...inBl, ...inFilt].map(i => i.name.toLowerCase().trim()))
  console.log(`  Exp=${inExp.length} · NEX=${inNex.length} · PCT=${inPct.length} · OFF=${inOff.length} · BL=${inBl.length} · FILTERED=${inFilt.length}\n`)

  const isRealExp = t => { const s = (t||'').trim(); return s && s !== '–' && s !== '-' }
  const cleanCred = t => { const s = (t||'').trim(); if (!s || /^i don.?t have$/i.test(s) || /^don.?t have$/i.test(s) || /^n\/?a$/i.test(s) || /^no$/i.test(s) || /^none$/i.test(s)) return ''; return s }
  const isPH = l => /philippines|^ph$/i.test(l.country) || /^\+?639\d{8,10}$/.test((l.phone||'').replace(/\s/g,'')) || /^639\d{8,10}$/.test((l.country||'').replace(/\s/g,''))
  const inferCountry = l => l.country && !/^\d+$/.test(l.country.replace(/\s/g,'')) ? l.country : (isPH(l) ? 'Philippines' : (l.country || ''))

  const buckets = { skipped: [], blocked: [], created: { exp: [], nex: [] }, failed: [] }
  for (const l of all) {
    const name = `${l.first} ${l.last}`.trim()
    if (!name) { buckets.skipped.push({ ...l, reason: 'no name' }); continue }
    if (monEmails.has(l.email) || monNames.has(name.toLowerCase())) { buckets.skipped.push({ ...l, name, reason: 'already on Monday' }); continue }

    // Blacklist guard
    const hit = guard.check({ email: l.email, phone: l.phone, telegram: l.telegram, name })
    const exp = isRealExp(l.timeSince)
    const country = inferCountry(l)
    const source = country === 'Philippines' ? 'Meta Lead Ad (PH)' : (/serbia/i.test(country) ? 'Meta Lead Ad (EU)' : 'Meta Lead Ad')

    let targetGroup, tag, sourceTag = source
    if (hit) {
      // Route to the same group they were in previously (OFFBOARDED vs BLACKLISTED).
      // Sheet-only hits default to OFFBOARDED (homeGroup set on load).
      targetGroup = hit.homeGroup || G_OFF
      const destName = targetGroup === G_OFF ? 'OFFBOARDED' : 'BLACKLISTED'
      tag = `BLOCKED→${destName}`
      sourceTag = `BLACKLIST HIT (${hit.status}, via ${hit.via}) — was going to ${exp ? 'Exp' : 'NonExp'}`
      buckets.blocked.push({ ...l, name, hit, dest: destName })
    } else {
      targetGroup = exp ? G_EXP : G_NEX
      tag = exp ? 'EXP' : 'NEX'
    }

    if (DRY) {
      console.log(`  [DRY ${tag}] ${name}  ·  ${country}${hit ? `  ·  matched "${hit.name}" (${hit.status}) via ${hit.via}` : ''}`)
      if (!hit) buckets.created[exp ? 'exp' : 'nex'].push({ name, country, l })
      continue
    }

    const cv = {
      [COL.source]: sourceTag,
      [COL.telegram]: cleanCred(l.telegram),
      [COL.phone]: l.phone && l.phone !== '–' ? l.phone : '',
      [COL.country]: country,
      [COL.discord]: cleanCred(l.discord),
    }
    if (l.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email)) cv[COL.email] = { email: l.email, text: l.email }

    const j = await M(`mutation ($n: String!, $c: JSON!) { create_item(board_id: ${PH}, group_id: "${targetGroup}", item_name: $n, column_values: $c) { id } }`, { n: name, c: JSON.stringify(cv) })
    if (j.errors || !j.data?.create_item?.id) { console.log(`  ✗ ${name}: ${JSON.stringify(j.errors)}`); buckets.failed.push({ name, error: j.errors }); continue }
    const iid = j.data.create_item.id
    console.log(`  ✓ [${tag}] ${name}  ·  ${country}${hit ? `  ·  ${hit.status}/${hit.via}` : ''}  ·  item ${iid}`)
    if (!hit) buckets.created[exp ? 'exp' : 'nex'].push({ name, iid })

    // Q&A update
    const q = (t, v) => (v && v !== '–' && v !== '-') ? `**${t}**\n${v}\n\n` : ''
    const body = [`Meta Lead Ad — synced from sheet${hit ? ' — BLACKLIST HIT' : ''}`, '',
      q('Country', country), q('English level', l.english), q('Hours available per week', l.hours),
      q('Prior experience as OF Chatter?', l.prevExp),
      q('Time since last chatter job', l.timeSince),
      q('History as OF chatter', l.history),
      q('How soon to start', l.startSoon), q('Why top 10%?', l.why),
      q('UTM source / medium', `${l.utmSrc} / ${l.utmMed}`.replace(/^\s*\/\s*$/,'')),
      q('Submitted', l.date),
      hit ? q('BLACKLIST MATCH', `${hit.name} · ${hit.status} · matched via ${hit.via}`) : '',
    ].join('')
    await M(`mutation ($iid: ID!, $b: String!) { create_update(item_id: $iid, body: $b) { id } }`, { iid, b: body })
    await new Promise(r => setTimeout(r, 200))
  }

  const blockedToOff = buckets.blocked.filter(b => b.dest === 'OFFBOARDED').length
  const blockedToBl  = buckets.blocked.filter(b => b.dest === 'BLACKLISTED').length
  console.log('\n═══ SUMMARY ═══')
  console.log(`  ✓ ${buckets.created.exp.length} created in APPLICANTS (C) Exp`)
  console.log(`  ✓ ${buckets.created.nex.length} created in APPLICANTS (C) Non Exp`)
  console.log(`  🚫 ${buckets.blocked.length} blocked → ${blockedToOff} to OFFBOARDED, ${blockedToBl} to BLACKLISTED`)
  console.log(`  ⏭ ${buckets.skipped.length} skipped (already on Monday or no name)`)
  console.log(`  ✗ ${buckets.failed.length} failed`)

  if (buckets.blocked.length > 0) {
    console.log('\nBLOCKED CANDIDATES:')
    for (const b of buckets.blocked) console.log(`  · ${b.name}  →  ${b.dest}  ·  matched "${b.hit.name}" (${b.hit.status}) via ${b.hit.via}`)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
