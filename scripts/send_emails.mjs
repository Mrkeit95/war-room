#!/usr/bin/env node
/**
 * Autonomous email sender via Resend.
 *
 * Replaces Monday's flaky Gmail integration. Every 15 min (cron) this script:
 *   1. Reads the PH board's APPLICANTS (C) EXP + NON EXP groups.
 *   2. Filters to items where "Email Sent" != "Sent".
 *   3. Sends the group-specific template via Resend to each candidate.
 *   4. Marks the item's "Email Sent" column as "Sent" so it never sends twice.
 *
 * Env required:
 *   MONDAY_API_TOKEN, MONDAY_BOARD_ID_PH, RESEND_API_KEY, EMAIL_FROM
 *
 * Usage:
 *   node --env-file=.env.local scripts/send_emails.mjs
 *   node --env-file=.env.local scripts/send_emails.mjs --dry
 *   node --env-file=.env.local scripts/send_emails.mjs --only-group=<gid>
 *   node --env-file=.env.local scripts/send_emails.mjs --limit=25       # cap this run
 *   node --env-file=.env.local scripts/send_emails.mjs --test=you@x.com # send test to yourself
 */

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run')
const ONLY_GROUP = (process.argv.find(a => a.startsWith('--only-group=')) || '').split('=')[1]
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity
const TEST_TO = (process.argv.find(a => a.startsWith('--test=')) || '').split('=')[1]
const ONLY_EMAIL = ((process.argv.find(a => a.startsWith('--only-email=')) || '').split('=')[1] || '').toLowerCase()

const MON = process.env.MONDAY_API_TOKEN
const PH  = process.env.MONDAY_BOARD_ID_PH
const RESEND_KEY = process.env.RESEND_API_KEY
const FROM = process.env.EMAIL_FROM || 'Chatstars Training <training@chatstars.co>'
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'training@chatstars.co'

if (!MON) throw new Error('MONDAY_API_TOKEN not set')
if (!PH)  throw new Error('MONDAY_BOARD_ID_PH not set')
if (!RESEND_KEY) throw new Error('RESEND_API_KEY not set')

// ─── Column + group IDs on the current PH board ───────────────────────
const COL = {
  email:     'email_mkmyj2e4',
  emailSent: 'color_mm78gm1t',   // Email Sent status column (labels: Sent / Failed / Bounced)
}
const G_EXP = 'group_mm6wk20'  // APPLICANTS (C) EXP
const G_NEX = 'group_mm6tcv2t' // APPLICANTS (C) NON EXP

// ─── Email templates ──────────────────────────────────────────────────
// One entry per Monday group we send from. Adding another group is 4 lines.
const TEMPLATES = {
  [G_EXP]: {
    label: 'APPLICANTS (C) EXP',
    subject: 'Chatstars — Next step to continue your application',
    html: ({ name }) => `
<p>Hi ${name || 'there'},</p>
<p>Thank you for applying to Chatstars.</p>
<p>To continue your application, we need you to complete the next step of our hiring process — a short follow-up form. This helps our team properly assess your experience and confirm you're a fit for the role.</p>
<p><strong>You must complete this step in order to move forward:</strong></p>
<p>👉 <a href="https://fe02gsro908.typeform.com/to/KnkH7pY6">https://fe02gsro908.typeform.com/to/KnkH7pY6</a></p>
<p>It takes around 2 minutes. Once submitted, our team will review your responses and be in touch with the next steps.</p>
<p>If you have any questions, you can reach our hiring manager on Telegram:</p>
<p>• @mtnx0 (Milosz)</p>
<p>We look forward to reviewing your submission.</p>
<p>Kind regards,<br/>The Chatstars Team</p>
<p style="color:#888;font-size:12px;margin-top:24px">THIS IS AN AUTOMATED EMAIL, DO NOT REPLY</p>
`.trim(),
  },
  [G_NEX]: {
    label: 'APPLICANTS (C) NON EXP',
    subject: 'Chatstars — Next steps to begin training',
    html: ({ name }) => `
<p>Hi ${name || 'there'},</p>
<p>Thank you for applying to Chatstars.</p>
<p>To move forward with your application, the next step is to join our official training Telegram channel. All training instructions, schedules, and next steps will be posted there:</p>
<p>👉 <a href="https://t.me/+JUYWdHgBXkdmN2Y1">https://t.me/+JUYWdHgBXkdmN2Y1</a></p>
<p>Please join as soon as possible so you don't miss any updates or the start of your training.</p>
<p>If you have any questions along the way, you can reach our hiring managers on Telegram:</p>
<p>• @applebee1113<br/>• @pau_chtstrs</p>
<p>We look forward to having you.</p>
<p>Kind regards,<br/>The Chatstars Team</p>
<p style="color:#888;font-size:12px;margin-top:24px">THIS IS AN AUTOMATED EMAIL, DO NOT REPLY</p>
`.trim(),
  },
}

// ─── Monday helpers ───────────────────────────────────────────────────
async function M(q, v, tries=3) {
  for (let i=0; i<tries; i++) {
    try { return await (await fetch('https://api.monday.com/v2', { method:'POST', headers:{'Authorization':MON,'Content-Type':'application/json','API-Version':'2024-10'}, body: JSON.stringify({query:q, variables:v}) })).json() }
    catch(e) { if (i===tries-1) throw e; await new Promise(x=>setTimeout(x,1500*(i+1))) }
  }
}

async function fetchGroupItems(gid) {
  const rows = []; let cursor = null
  while (true) {
    const q = cursor
      ? `{ next_items_page(limit:500, cursor:"${cursor}") { cursor items { id name column_values(ids:["${COL.email}","${COL.emailSent}"]) { id text } } } }`
      : `{ boards(ids:[${PH}]) { groups(ids:["${gid}"]) { items_page(limit:500) { cursor items { id name column_values(ids:["${COL.email}","${COL.emailSent}"]) { id text } } } } } }`
    const r = await M(q)
    const page = cursor ? r.data?.next_items_page : r.data?.boards?.[0]?.groups?.[0]?.items_page
    rows.push(...(page?.items ?? []))
    cursor = page?.cursor
    if (!cursor) break
  }
  return rows
}

async function markSent(itemId, label='Sent') {
  const r = await M(`mutation ($iid:ID!, $c:JSON!) { change_multiple_column_values(board_id:${PH}, item_id:$iid, column_values:$c) { id } }`,
    { iid: itemId, c: JSON.stringify({ [COL.emailSent]: { label } }) })
  if (r.errors) console.log(`  ⚠ mark ${itemId} as ${label}: ${JSON.stringify(r.errors)}`)
  return !r.errors
}

// ─── Resend helper ────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  const body = { from: FROM, to: [to], subject, html, reply_to: REPLY_TO }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) return { ok: false, error: j?.message || r.statusText || `status ${r.status}` }
  return { ok: true, id: j?.id }
}

// ─── Utilities ────────────────────────────────────────────────────────
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e||'').trim())
const cleanName = n => (n||'').trim().split(/\s+/)[0].replace(/[^\p{L}\s'-]/gu, '') || ''

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`── ${DRY ? 'DRY RUN' : 'LIVE'} · sender=${FROM} ──\n`)

  // Test path — skip all Monday reads, just send to one address.
  if (TEST_TO) {
    if (!isEmail(TEST_TO)) throw new Error(`--test=${TEST_TO} is not a valid email`)
    console.log(`Sending TEST email to ${TEST_TO}…`)
    const tpl = TEMPLATES[G_EXP]
    const r = await sendEmail({ to: TEST_TO, subject: `[TEST] ${tpl.subject}`, html: tpl.html({ name: 'Test Candidate' }) })
    console.log(r.ok ? `✓ Resend id ${r.id}` : `✗ ${r.error}`)
    return
  }

  const groupsToProcess = ONLY_GROUP ? [ONLY_GROUP] : Object.keys(TEMPLATES)

  const stats = { skippedSent: 0, skippedBadEmail: 0, sent: 0, failed: 0, attempted: 0 }
  for (const gid of groupsToProcess) {
    const tpl = TEMPLATES[gid]
    if (!tpl) { console.log(`  ⚠ no template for group ${gid} — skipping`); continue }

    console.log(`\n═══ ${tpl.label} (${gid}) ═══`)
    const items = await fetchGroupItems(gid)
    console.log(`  ${items.length} items in group`)

    const pending = items.filter(it => {
      const sent = it.column_values.find(c => c.id === COL.emailSent)?.text || ''
      if (/^sent$/i.test(sent.trim())) return false
      if (ONLY_EMAIL) {
        const e = (it.column_values.find(c => c.id === COL.email)?.text || '').toLowerCase().trim()
        return e === ONLY_EMAIL
      }
      return true
    })
    console.log(`  ${pending.length} pending (not yet marked Sent)`)
    stats.skippedSent += (items.length - pending.length)

    for (const it of pending) {
      if (stats.attempted >= LIMIT) { console.log(`  (limit ${LIMIT} reached — stopping)`); break }
      const email = (it.column_values.find(c => c.id === COL.email)?.text || '').trim().toLowerCase()
      const firstName = cleanName(it.name)
      if (!isEmail(email)) {
        stats.skippedBadEmail++
        console.log(`  ⚠ ${it.name} — bad email "${email}", skipping`)
        continue
      }
      stats.attempted++
      if (DRY) {
        console.log(`  [DRY] ${it.name} <${email}>`)
        continue
      }
      const r = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html({ name: firstName }) })
      if (!r.ok) {
        stats.failed++
        console.log(`  ✗ ${it.name} <${email}>: ${r.error}`)
        await markSent(it.id, 'Failed')
      } else {
        stats.sent++
        await markSent(it.id, 'Sent')
        console.log(`  ✓ ${it.name} <${email}> · resend=${r.id}`)
      }
      // Rate limit: Resend allows 10/sec; we do ~5/sec to stay safe under bursts.
      await new Promise(x => setTimeout(x, 200))
    }
  }

  console.log(`\n═══ SUMMARY ═══`)
  console.log(`  ✓ ${stats.sent} sent`)
  console.log(`  ✗ ${stats.failed} failed`)
  console.log(`  ⏭ ${stats.skippedSent} already sent (skipped)`)
  console.log(`  ⚠ ${stats.skippedBadEmail} skipped (missing/invalid email)`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
