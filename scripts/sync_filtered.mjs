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
  const walk = fs => { for (const f of fs ?? []) { if (f.title) titleById[f.id] = f.title; if (f.properties?.fields) walk(f.properties.fields) } }
  walk(formJ.fields)
  console.log(`  form "${formJ.title}" · ${respJ.length} completed responses\n`)

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

  console.log('Fetching Monday state…')
  const [srcItems, targetItems, tfItems] = await Promise.all([
    pageGroup(G_SOURCE),
    pageGroup(G_TARGET),
    pageGroup(G_ORIG_TF),
  ])
  const filteredEmails = new Set(targetItems.map(i => (i.column_values?.[0]?.text ?? '').toLowerCase().trim()).filter(Boolean))
  const filteredNames  = new Set(targetItems.map(i => i.name.toLowerCase().trim()))
  const byEmailInMoveable = new Map()
  const byNameInMoveable  = new Map()
  for (const it of [...srcItems, ...tfItems]) {
    const e = (it.column_values?.[0]?.text ?? '').toLowerCase().trim()
    if (e && !byEmailInMoveable.has(e)) byEmailInMoveable.set(e, it)
    const n = it.name.toLowerCase().trim()
    if (n && !byNameInMoveable.has(n)) byNameInMoveable.set(n, it)
  }
  console.log(`  APPLICANTS (C) Exp: ${srcItems.length} · EXP TYPEFORMS (O + C): ${tfItems.length} · FILTERED (EXP): ${targetItems.length}\n`)

  const ansV = (answers, fid) => {
    const a = answers?.find(x => x.field.id === fid)
    if (!a) return ''
    return a.text ?? a.email ?? a.phone_number ?? ''
  }

  let moved = 0, alreadyFiltered = 0, notFound = 0, failed = 0
  for (const r of respJ) {
    const respEmail = clean(ansV(r.answers, emailFieldId)).toLowerCase()
    if (!respEmail) { console.log('  ! response missing email — skipping'); continue }

    if (filteredEmails.has(respEmail)) { alreadyFiltered++; continue }

    // Match by email in APPLICANTS (C) Exp OR EXP TYPEFORMS (O + C)
    let match = byEmailInMoveable.get(respEmail)
    if (!match) {
      // Fallback: by name from the response
      const nameFieldId = Object.entries(titleById).find(([, t]) => /full name/i.test(t))?.[0]
      const respName = nameFieldId ? clean(ansV(r.answers, nameFieldId)) : ''
      if (respName) match = byNameInMoveable.get(respName.toLowerCase())
    }
    if (!match) {
      console.log(`  ? ${respEmail}: not found on Monday (no matching APPLICANTS item)`)
      notFound++
      continue
    }
    if (filteredNames.has(match.name.toLowerCase().trim())) { alreadyFiltered++; continue }

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

    // Post follow-up Q&A as Update
    const lines = ['Experienced chatter — Follow-up filter', '']
    for (const a of r.answers ?? []) {
      const t = titleById[a.field.id] ?? a.field.id
      const val = a.text ?? a.email ?? a.phone_number
        ?? (a.boolean === true ? 'Yes' : a.boolean === false ? 'No' : null)
        ?? a.number ?? a.choice?.label
        ?? (a.choices?.labels?.join(', ') ?? null)
        ?? a.date ?? ''
      if (val === null || val === undefined || val === '') continue
      lines.push(`**${t}**`, String(val), '')
    }
    await M(`mutation ($iid: ID!, $b: String!) { create_update(item_id: $iid, body: $b) { id } }`, { iid: match.id, b: lines.join('\n') })

    console.log(`  ✓ moved ${match.name} → FILTERED (EXP) · ${respEmail}`)
    moved++
    await new Promise(r => setTimeout(r, 200))
  }

  console.log('\n═══ SUMMARY ═══')
  console.log(`  ✓ ${moved} moved to FILTERED (EXP)`)
  console.log(`  ⏭ ${alreadyFiltered} already filtered (skipped)`)
  console.log(`  ? ${notFound} not found on Monday (form-filler wasn't in APPLICANTS)`)
  console.log(`  ✗ ${failed} failed`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
