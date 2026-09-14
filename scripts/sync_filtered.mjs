#!/usr/bin/env node
/**
 * Follow-up filter sync.
 *
 * Pulls responses from the "Experienced chatter- Filtering" Typeform (KnkH7pY6)
 * and moves matching Monday items from APPLICANTS (C) Exp → FILTERED (EXP) with
 * the full follow-up Q&A posted as an Update.
 *
 * Match strategy: by email (primary), then by name (fallback).
 * Dedup: skips items already in FILTERED (EXP).
 *
 * USAGE:
 *   node --env-file=.env.local scripts/sync_filtered.mjs
 *   node --env-file=.env.local scripts/sync_filtered.mjs --dry
 */

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run')

const TF_TOKEN = process.env.TYPEFORM_TOKEN
if (!TF_TOKEN) throw new Error('TYPEFORM_TOKEN not set')
const FORM_ID  = 'KnkH7pY6'
const MON = process.env.MONDAY_API_TOKEN
const PH  = process.env.MONDAY_BOARD_ID_PH

const G_SOURCE   = 'group_mm6wk20'   // APPLICANTS (C) Exp (where they live pre-filter)
const G_TARGET   = 'group_mm6xv03r'  // FILTERED (EXP) (where they land post-filter)
const G_ORIG_TF  = 'group_mm6k99g5'  // EXP TYPEFORMS (O + C) — also allow move from here

const COL = { source:'text_mknf4048', email:'email_mkmyj2e4' }

const clean = v => (v || '').trim()
const M = (q, v) => fetch('https://api.monday.com/v2', {
  method: 'POST',
  headers: { 'Authorization': MON, 'Content-Type': 'application/json', 'API-Version': '2024-10' },
  body: JSON.stringify({ query: q, variables: v }),
}).then(r => r.json())

async function pageGroup(gid) {
  const rows = []; let cursor = null
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

async function main() {
  console.log(DRY ? '── DRY RUN ──\n' : '── LIVE ──\n')

  console.log('Fetching form structure + responses…')
  const [formJ, respJ] = await Promise.all([
    fetch(`https://api.typeform.com/forms/${FORM_ID}`, { headers: { Authorization: `Bearer ${TF_TOKEN}` } }).then(r => r.json()),
    (async () => {
      const items = []; let before = null
      while (true) {
        const url = new URL(`https://api.typeform.com/forms/${FORM_ID}/responses`)
        url.searchParams.set('page_size', '100')
        url.searchParams.set('completed', 'true')
        if (before) url.searchParams.set('before', before)
        const j = await (await fetch(url, { headers: { Authorization: `Bearer ${TF_TOKEN}` } })).json()
        items.push(...(j.items ?? []))
        if ((j.items ?? []).length < 100) break
        before = j.items[j.items.length - 1].token
      }
      return items
    })(),
  ])
  const titleById = {}
  const imageById = {}  // fieldId → image URL if the question has an attached image
  const walk = fs => {
    for (const f of fs ?? []) {
      if (f.title) titleById[f.id] = f.title
      if (f.attachment?.type === 'image' && f.attachment.href) imageById[f.id] = f.attachment.href
      if (f.properties?.fields) walk(f.properties.fields)
    }
  }
  walk(formJ.fields)
  console.log(`  form "${formJ.title}" · ${respJ.length} completed responses · ${Object.keys(imageById).length} questions have images\n`)

  if (respJ.length === 0) {
    console.log('No responses yet. Nothing to do.')
    return
  }

  // Detect the "email" question in the form dynamically
  const emailFieldId = (() => {
    const flat = []
    const w = fs => { for (const f of fs ?? []) { flat.push(f); if (f.properties?.fields) w(f.properties.fields) } }
    w(formJ.fields)
    const m = flat.find(f => /email/i.test(f.title))
    return m?.id
  })()
  if (!emailFieldId) throw new Error('No email question found in the follow-up form')

  console.log('Fetching Monday state (whole board, so submitters can be found wherever they are)…')
  // Widen the search to every group on the board so a typeform submitter who
  // has already been moved to PENDING WEEK 1 / TRAINING / STANDBY / etc. still
  // gets found, moved to FILTERED, and gets their Q&A update posted.
  const groupsResp = await M(`{ boards(ids: [${PH}]) { groups { id title } } }`, {})
  const boardGroups = groupsResp.data?.boards?.[0]?.groups ?? []
  const pages = await Promise.all(boardGroups.map(g => pageGroup(g.id).then(items => items.map(it => ({ ...it, groupId: g.id, groupTitle: g.title })))))
  const allItems = pages.flat()
  const targetItems = allItems.filter(i => i.groupId === G_TARGET)

  // Filtered-side lookup: items already in FILTERED (EXP). We use this to
  // (a) skip movers who are already there and (b) backfill Q&A comments on
  // items that landed here without an Update.
  const filteredByEmail = new Map()
  const filteredByName  = new Map()
  for (const i of targetItems) {
    const e = (i.column_values?.[0]?.text ?? '').toLowerCase().trim()
    if (e) filteredByEmail.set(e, i)
    const n = i.name.toLowerCase().trim()
    if (n) filteredByName.set(n, i)
  }

  // Moveable-side lookup: every item on the board that isn't already in FILTERED.
  // If a typeform response matches one of these by email or name we move it
  // into FILTERED (EXP).
  const byEmailInMoveable = new Map()
  const byNameInMoveable  = new Map()
  for (const it of allItems) {
    if (it.groupId === G_TARGET) continue
    const e = (it.column_values?.[0]?.text ?? '').toLowerCase().trim()
    if (e && !byEmailInMoveable.has(e)) byEmailInMoveable.set(e, it)
    const n = it.name.toLowerCase().trim()
    if (n && !byNameInMoveable.has(n)) byNameInMoveable.set(n, it)
  }
  console.log(`  ${boardGroups.length} groups scanned · ${allItems.length} total items · FILTERED (EXP)=${targetItems.length}\n`)

  const ansV = (answers, fid) => {
    const a = answers?.find(x => x.field.id === fid)
    if (!a) return ''
    return a.text ?? a.email ?? a.phone_number ?? ''
  }

  // Build the Q&A Update body from a Typeform response — reused for both
  // fresh moves and backfilling items already in FILTERED that never got one.
  const buildQaBody = (r) => {
    const lines = ['Experienced chatter — Follow-up filter', '']
    for (const a of r.answers ?? []) {
      const t = titleById[a.field.id] ?? a.field.id
      const val = a.text ?? a.email ?? a.phone_number
        ?? (a.boolean === true ? 'Yes' : a.boolean === false ? 'No' : null)
        ?? a.number ?? a.choice?.label
        ?? (a.choices?.labels?.join(', ') ?? null)
        ?? a.date ?? ''
      if (val === null || val === undefined || val === '') continue
      lines.push(`<strong>${t}</strong>`)
      const img = imageById[a.field.id]
      if (img) lines.push(`<img src="${img}" style="max-width:500px;display:block;margin:6px 0" />`)
      lines.push(String(val).replace(/\n/g, '<br />'))
      lines.push('')
    }
    return lines.join('\n')
  }

  // Preload existing updates for FILTERED items so we can detect when one is
  // missing its Q&A. We check for a body starting with the follow-up header.
  const filteredUpdates = new Map()
  for (const it of targetItems) {
    const q = `{ items(ids:[${it.id}]) { updates(limit:20) { body } } }`
    const r = await M(q, {})
    const bodies = (r.data?.items?.[0]?.updates ?? []).map(u => u.body || '')
    filteredUpdates.set(it.id, bodies.some(b => /Experienced chatter[\s\S]*Follow.?up filter/i.test(b)))
  }
  const needsQaBackfill = (item) => filteredUpdates.get(item.id) === false

  let moved = 0, alreadyFiltered = 0, notFound = 0, failed = 0, qaBackfilled = 0
  for (const r of respJ) {
    const respEmail = clean(ansV(r.answers, emailFieldId)).toLowerCase()
    if (!respEmail) { console.log('  ! response missing email — skipping'); continue }

    // Already in FILTERED? Check if the Q&A comment is missing; if so, post it.
    const existing = filteredByEmail.get(respEmail)
    if (existing) {
      if (needsQaBackfill(existing)) {
        if (!DRY) {
          await M(`mutation ($iid: ID!, $b: String!) { create_update(item_id: $iid, body: $b) { id } }`, { iid: existing.id, b: buildQaBody(r) })
          console.log(`  + Q&A backfilled for ${existing.name} (${respEmail})`)
          filteredUpdates.set(existing.id, true)
        } else {
          console.log(`  [DRY BACKFILL] ${existing.name} (${respEmail}) — post Q&A on existing FILTERED item`)
        }
        qaBackfilled++
      } else {
        alreadyFiltered++
      }
      continue
    }

    // Match anywhere else on the board — by email first, then by name.
    let match = byEmailInMoveable.get(respEmail)
    if (!match) {
      const nameFieldId = Object.entries(titleById).find(([, t]) => /full name/i.test(t))?.[0]
      const respName = nameFieldId ? clean(ansV(r.answers, nameFieldId)) : ''
      if (respName) match = byNameInMoveable.get(respName.toLowerCase())
    }
    if (!match) {
      console.log(`  ? ${respEmail}: not found on Monday (submitter never made it onto the board)`)
      notFound++
      continue
    }
    if (filteredByName.has(match.name.toLowerCase().trim())) { alreadyFiltered++; continue }

    if (DRY) {
      console.log(`  [DRY MOVE] ${match.name} (${respEmail}) → FILTERED (EXP)`)
      continue
    }

    // Move item to FILTERED (EXP)
    const mv = await M(`mutation ($iid: ID!) { move_item_to_group(item_id: $iid, group_id: "${G_TARGET}") { id } }`, { iid: match.id })
    if (mv.errors) { console.log(`  ✗ move ${match.name}: ${JSON.stringify(mv.errors)}`); failed++; continue }

    // Update source column so you can see they passed the filter
    await M(`mutation ($iid: ID!, $c: JSON!) { change_multiple_column_values(board_id: ${PH}, item_id: $iid, column_values: $c) { id } }`, {
      iid: match.id,
      c: JSON.stringify({ [COL.source]: `PASSED FOLLOW-UP FILTER — ${new Date().toISOString().slice(0,10)}` }),
    })

    // Post follow-up Q&A as Update, images embedded inline.
    await M(`mutation ($iid: ID!, $b: String!) { create_update(item_id: $iid, body: $b) { id } }`, { iid: match.id, b: buildQaBody(r) })

    console.log(`  ✓ moved ${match.name} → FILTERED (EXP) · ${respEmail}`)
    moved++
    await new Promise(r => setTimeout(r, 200))
  }

  console.log('\n═══ SUMMARY ═══')
  console.log(`  ✓ ${moved} moved to FILTERED (EXP)`)
  console.log(`  + ${qaBackfilled} Q&A backfilled on items already in FILTERED`)
  console.log(`  ⏭ ${alreadyFiltered} already filtered with Q&A (skipped)`)
  console.log(`  ? ${notFound} not found on Monday (submitter never made it onto the board)`)
  console.log(`  ✗ ${failed} failed`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
