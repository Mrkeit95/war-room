#!/usr/bin/env node
/**
 * Referrals follow-up-filter sync.
 *
 * Pulls responses from the "Experienced chatter- Filtering (Referrals)"
 * Typeform (EkmOttNH) and, for each response, finds the auto-created Monday
 * item (created by Monday's own Typeform automation) and posts the full Q&A
 * as an Update — so the chat notes on CHATTER DATABASE show every answer,
 * matching how the EXP filter form works on HIRING PIPELINE.
 *
 * Match strategy: by email (primary), then by name (fallback). Searches both
 * boards (CHATTER DATABASE + HIRING PIPELINE) so it works regardless of
 * which board the Monday automation currently targets.
 *
 * Dedup: skips items that already have a "Referral — Follow-up filter" update.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/sync_referrals.mjs
 *   node --env-file=.env.local scripts/sync_referrals.mjs --dry
 */

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run')

const TF_TOKEN = process.env.TYPEFORM_TOKEN
if (!TF_TOKEN) throw new Error('TYPEFORM_TOKEN not set')
const FORM_ID = 'EkmOttNH'
const UPDATE_MARKER = 'Experienced chatter (Referral) — Follow-up filter'

const MON = process.env.MONDAY_API_TOKEN
const PH = process.env.MONDAY_BOARD_ID_PH        // CHATTER DATABASE
const HIRING = process.env.MONDAY_BOARD_ID_HIRING // HIRING PIPELINE
const SEARCH_BOARDS = [...new Set([PH, HIRING].filter(Boolean))]

const COL = {
  source: 'text_mknf4048',
  email: 'email_mkmyj2e4',
  telegram: 'text_mkmyfzv0',
  discord: 'text_mm57381d',
  phone: 'text_mkmysvvs',
  country: 'text_mkmy8ag1',
}

const clean = v => (v || '').trim()
const M = (q, v) => fetch('https://api.monday.com/v2', {
  method: 'POST',
  headers: { 'Authorization': MON, 'Content-Type': 'application/json', 'API-Version': '2024-10' },
  body: JSON.stringify({ query: q, variables: v }),
}).then(r => r.json())

// Pull every item across every group on a board, with the email column.
async function loadBoardItems(boardId) {
  const rows = []; let cursor = null
  while (true) {
    const q = cursor
      ? `{ next_items_page(limit:500, cursor:"${cursor}"){ cursor items{ id name column_values(ids:["${COL.email}"]){ text } } } }`
      : `{ boards(ids:[${boardId}]){ items_page(limit:500){ cursor items{ id name column_values(ids:["${COL.email}"]){ text } } } } }`
    const r = await M(q, {})
    const page = cursor ? r.data?.next_items_page : r.data?.boards?.[0]?.items_page
    rows.push(...(page?.items ?? []))
    cursor = page?.cursor
    if (!cursor) break
  }
  return rows
}

async function hasReferralUpdate(itemId) {
  const r = await M(`query($id:[ID!]!){ items(ids:$id){ updates(limit:50){ body text_body } } }`, { id: [itemId] })
  const updates = r.data?.items?.[0]?.updates ?? []
  return updates.some(u => (u.text_body || u.body || '').includes(UPDATE_MARKER))
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
  const imageById = {}
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

  // Detect field ids for the questions we care about
  const flat = []
  const w = fs => { for (const f of fs ?? []) { flat.push(f); if (f.properties?.fields) w(f.properties.fields) } }
  w(formJ.fields)
  const findId = re => flat.find(f => re.test(f.title || ''))?.id
  const emailFieldId    = findId(/email/i)
  const nameFieldId     = findId(/full name/i)
  const telegramFieldId = findId(/telegram/i)
  const discordFieldId  = findId(/discord/i)
  const phoneFieldId    = findId(/phone/i)
  const countryFieldId  = findId(/country/i)
  const referrerFieldId = findId(/referred by/i)
  if (!emailFieldId) throw new Error('No email question found in referral form')

  const ansV = (answers, fid) => {
    const a = answers?.find(x => x.field.id === fid)
    if (!a) return ''
    return a.text ?? a.email ?? a.phone_number ?? ''
  }

  console.log(`Loading Monday state across ${SEARCH_BOARDS.length} board(s)…`)
  const allItems = []
  const itemBoard = new Map()
  for (const b of SEARCH_BOARDS) {
    const items = await loadBoardItems(b)
    for (const it of items) itemBoard.set(String(it.id), b)
    allItems.push(...items)
    console.log(`  board ${b}: ${items.length} items`)
  }
  const byEmail = new Map()
  const byName = new Map()
  for (const it of allItems) {
    const e = (it.column_values?.[0]?.text ?? '').toLowerCase().trim()
    if (e && !byEmail.has(e)) byEmail.set(e, it)
    const n = it.name.toLowerCase().trim()
    if (n && !byName.has(n)) byName.set(n, it)
  }
  console.log('')

  let posted = 0, alreadyPosted = 0, notFound = 0, failed = 0
  for (const r of respJ) {
    const respEmail = clean(ansV(r.answers, emailFieldId)).toLowerCase()
    const respName = nameFieldId ? clean(ansV(r.answers, nameFieldId)) : ''
    if (!respEmail && !respName) { console.log('  ! response missing email + name — skipping'); continue }

    let match = respEmail && byEmail.get(respEmail)
    if (!match && respName) match = byName.get(respName.toLowerCase())
    if (!match) {
      console.log(`  ? ${respName || respEmail}: no Monday item found (Monday's own automation may not have created it yet)`)
      notFound++
      continue
    }

    if (await hasReferralUpdate(match.id)) { alreadyPosted++; continue }

    // Pull the contact fields + referrer from the response so we can stamp
    // them onto the Monday item (Monday's own Typeform automation only fills
    // name/email — we backfill the rest here).
    const cleanCred = s => clean(s).replace(/^@+/, '')
    const respTelegram = telegramFieldId ? cleanCred(ansV(r.answers, telegramFieldId)) : ''
    const respDiscord  = discordFieldId  ? cleanCred(ansV(r.answers, discordFieldId))  : ''
    const respPhone    = phoneFieldId    ? clean(ansV(r.answers, phoneFieldId))        : ''
    const respCountry  = countryFieldId  ? clean(ansV(r.answers, countryFieldId))      : ''
    const respReferrer = referrerFieldId ? clean(ansV(r.answers, referrerFieldId))     : ''
    const sourceTag = respReferrer ? `EMPLOYEE REFERRAL — ${respReferrer}` : 'EMPLOYEE REFERRAL'

    if (DRY) {
      console.log(`  [DRY POST] ${match.name} (${respEmail}) → Q&A update + source="${sourceTag}"`)
      continue
    }

    // Stamp contact fields + source onto the Monday item.
    const cv = { [COL.source]: sourceTag }
    if (respEmail)    cv[COL.email]    = { email: respEmail, text: respEmail }
    if (respTelegram) cv[COL.telegram] = respTelegram
    if (respDiscord)  cv[COL.discord]  = respDiscord
    if (respPhone)    cv[COL.phone]    = respPhone
    if (respCountry)  cv[COL.country]  = respCountry
    const matchBoard = itemBoard.get(String(match.id)) || PH
    const upd = await M(`mutation($iid:ID!, $c:JSON!){ change_multiple_column_values(board_id:${matchBoard}, item_id:$iid, column_values:$c){ id } }`,
      { iid: match.id, c: JSON.stringify(cv) })
    if (upd.errors) console.log(`  ⚠ column write on ${match.name}: ${JSON.stringify(upd.errors)}`)

    // Build Q&A body (same style as sync_filtered.mjs)
    const lines = [UPDATE_MARKER, '']
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
    const post = await M(`mutation($iid:ID!, $b:String!){ create_update(item_id:$iid, body:$b){ id } }`, { iid: match.id, b: lines.join('\n') })
    if (post.errors) { console.log(`  ✗ ${match.name}: ${JSON.stringify(post.errors)}`); failed++; continue }
    console.log(`  ✓ posted Q&A on ${match.name} (${respEmail})`)
    posted++
    await new Promise(r => setTimeout(r, 200))
  }

  console.log('\n═══ SUMMARY ═══')
  console.log(`  ✓ ${posted} Q&A updates posted`)
  console.log(`  ⏭ ${alreadyPosted} already had the update (skipped)`)
  console.log(`  ? ${notFound} not found on Monday (auto-created item missing)`)
  console.log(`  ✗ ${failed} failed`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
