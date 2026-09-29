#!/usr/bin/env node
/**
 * Referrals follow-up-filter sync.
 *
 * Handles every experienced-chatter referral Typeform we run. Monday's own
 * Typeform automation creates the item (name + email only). This cron
 * finds that item and backfills the rest:
 *   - Source column (with the referrer/recruiter tag)
 *   - Contact columns (email, telegram, discord, phone, country)
 *   - Update / chat note with the full Q&A, scenario screenshots inline
 *
 * Add a new form by appending to FORMS.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/sync_referrals.mjs
 *   node --env-file=.env.local scripts/sync_referrals.mjs --dry
 */

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run')

const TF_TOKEN = process.env.TYPEFORM_TOKEN
if (!TF_TOKEN) throw new Error('TYPEFORM_TOKEN not set')

// Every referral typeform we sync. `sourcePrefix` tags the Source column so
// you can see at a glance which pipeline the candidate came in through.
// `marker` goes at the top of the Q&A update and is used to dedupe.
const FORMS = [
  {
    id: 'EkmOttNH',
    title: 'Experienced chatter- Filtering (Referrals)',
    sourcePrefix: 'EMPLOYEE REFERRAL',
    marker: 'Experienced chatter (Referral) — Follow-up filter',
  },
  {
    id: 'NH6V3cCO',
    title: 'Experienced chatter- (Referrals) (Rachel)',
    sourcePrefix: 'RACHEL REFERRAL',
    marker: 'Experienced chatter (Rachel Referral) — Follow-up filter',
  },
]

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

async function hasMarkerUpdate(itemId, marker) {
  const r = await M(`query($id:[ID!]!){ items(ids:$id){ updates(limit:50){ body text_body } } }`, { id: [itemId] })
  const updates = r.data?.items?.[0]?.updates ?? []
  return updates.some(u => (u.text_body || u.body || '').includes(marker))
}

async function fetchForm(formId) {
  return fetch(`https://api.typeform.com/forms/${formId}`, { headers: { Authorization: `Bearer ${TF_TOKEN}` } }).then(r => r.json())
}
async function fetchResponses(formId) {
  const items = []; let before = null
  while (true) {
    const url = new URL(`https://api.typeform.com/forms/${formId}/responses`)
    url.searchParams.set('page_size', '100')
    url.searchParams.set('completed', 'true')
    if (before) url.searchParams.set('before', before)
    const j = await (await fetch(url, { headers: { Authorization: `Bearer ${TF_TOKEN}` } })).json()
    items.push(...(j.items ?? []))
    if ((j.items ?? []).length < 100) break
    before = j.items[j.items.length - 1].token
  }
  return items
}

// Load Monday state ONCE — reused across all forms in this run.
async function loadMondayState() {
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
  return { byEmail, byName, itemBoard }
}

async function processForm(form, state) {
  console.log(`\n───── ${form.title} (${form.id}) ─────`)
  const [formJ, respJ] = await Promise.all([fetchForm(form.id), fetchResponses(form.id)])

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
  console.log(`  ${respJ.length} completed responses · ${Object.keys(imageById).length} questions have images`)

  if (respJ.length === 0) {
    console.log('  no responses yet — nothing to do')
    return { posted: 0, alreadyPosted: 0, notFound: 0, failed: 0 }
  }

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
  if (!emailFieldId) throw new Error(`No email question found in form ${form.id}`)

  const ansV = (answers, fid) => {
    const a = answers?.find(x => x.field.id === fid)
    if (!a) return ''
    return a.text ?? a.email ?? a.phone_number ?? ''
  }

  let posted = 0, alreadyPosted = 0, notFound = 0, failed = 0
  for (const r of respJ) {
    const respEmail = clean(ansV(r.answers, emailFieldId)).toLowerCase()
    const respName = nameFieldId ? clean(ansV(r.answers, nameFieldId)) : ''
    if (!respEmail && !respName) { console.log('  ! response missing email + name — skipping'); continue }

    let match = respEmail && state.byEmail.get(respEmail)
    if (!match && respName) match = state.byName.get(respName.toLowerCase())
    if (!match) {
      console.log(`  ? ${respName || respEmail}: no Monday item found (Monday's automation may not have created it yet)`)
      notFound++
      continue
    }

    if (await hasMarkerUpdate(match.id, form.marker)) { alreadyPosted++; continue }

    const cleanCred = s => clean(s).replace(/^@+/, '')
    const respTelegram = telegramFieldId ? cleanCred(ansV(r.answers, telegramFieldId)) : ''
    const respDiscord  = discordFieldId  ? cleanCred(ansV(r.answers, discordFieldId))  : ''
    const respPhone    = phoneFieldId    ? clean(ansV(r.answers, phoneFieldId))        : ''
    const respCountry  = countryFieldId  ? clean(ansV(r.answers, countryFieldId))      : ''
    const respReferrer = referrerFieldId ? clean(ansV(r.answers, referrerFieldId))     : ''
    const sourceTag = respReferrer ? `${form.sourcePrefix} — ${respReferrer}` : form.sourcePrefix

    if (DRY) {
      console.log(`  [DRY POST] ${match.name} (${respEmail}) → source="${sourceTag}"`)
      continue
    }

    const cv = { [COL.source]: sourceTag }
    if (respEmail)    cv[COL.email]    = { email: respEmail, text: respEmail }
    if (respTelegram) cv[COL.telegram] = respTelegram
    if (respDiscord)  cv[COL.discord]  = respDiscord
    if (respPhone)    cv[COL.phone]    = respPhone
    if (respCountry)  cv[COL.country]  = respCountry
    const matchBoard = state.itemBoard.get(String(match.id)) || PH
    const upd = await M(`mutation($iid:ID!, $c:JSON!){ change_multiple_column_values(board_id:${matchBoard}, item_id:$iid, column_values:$c){ id } }`,
      { iid: match.id, c: JSON.stringify(cv) })
    if (upd.errors) console.log(`  ⚠ column write on ${match.name}: ${JSON.stringify(upd.errors)}`)

    const lines = [form.marker, '']
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
    console.log(`  ✓ posted Q&A on ${match.name} (${respEmail}) · source="${sourceTag}"`)
    posted++
    await new Promise(r => setTimeout(r, 200))
  }

  return { posted, alreadyPosted, notFound, failed }
}

async function main() {
  console.log(DRY ? '── DRY RUN ──' : '── LIVE ──')
  console.log(`Loading Monday state across ${SEARCH_BOARDS.length} board(s)…`)
  const state = await loadMondayState()

  const totals = { posted: 0, alreadyPosted: 0, notFound: 0, failed: 0 }
  for (const form of FORMS) {
    const r = await processForm(form, state)
    for (const k of Object.keys(totals)) totals[k] += r[k]
  }

  console.log('\n═══ TOTAL ═══')
  console.log(`  ✓ ${totals.posted} Q&A updates posted`)
  console.log(`  ⏭ ${totals.alreadyPosted} already had the update (skipped)`)
  console.log(`  ? ${totals.notFound} not found on Monday`)
  console.log(`  ✗ ${totals.failed} failed`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
