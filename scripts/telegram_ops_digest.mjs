// Ops digest cron. Two modes:
//   • --mode=daily    Daily 8:00pm PHT · RSVP tracker + 7-day trend
//   • --mode=monday   Monday 8:00am PHT · pre-training brief for Apple/Pauline
//
// Posts into the Training RSVPs topic. Numbers come from cs_telegram_subscriber
// and cs_training_rsvp.

import process from 'node:process'
import { sb, sendTracked, phtNow, nextMondayISO, friendlyDate } from './telegram_lib.mjs'

const DRY  = process.argv.includes('--dry')
const MODE = (process.argv.find(a => a.startsWith('--mode=')) || '').split('=')[1] || 'daily'

const OPS_CHAT_ID   = Number(process.env.TG_OPS_CHAT_ID)
const OPS_TOPIC_ID  = Number(process.env.TG_RSVP_TOPIC_ID)
if (!OPS_CHAT_ID || !OPS_TOPIC_ID) throw new Error('TG_OPS_CHAT_ID + TG_RSVP_TOPIC_ID required')

const trainingDate = nextMondayISO()

async function countSubscribers() {
  const r = await sb(`cs_telegram_subscriber?unsubscribed_at=is.null&select=telegram_user_id`)
  return r?.length || 0
}

async function countRsvps(dateStr, status = null) {
  let q = `cs_training_rsvp?training_date=eq.${dateStr}`
  if (status) q += `&status=eq.${status}`
  const r = await sb(q + `&select=telegram_user_id`)
  return r?.length || 0
}

async function countJoinedRoom(dateStr) {
  const r = await sb(
    `cs_training_rsvp?training_date=eq.${dateStr}&status=eq.yes&training_room_joined_at=not.is.null&select=telegram_user_id`
  )
  return r?.length || 0
}

async function recentDailyBuckets(dateStr) {
  // Group RSVP count by RSVP_AT date for the current week leading up to training
  const trainMs = new Date(dateStr + 'T00:00:00Z').getTime()
  const weekAgo = new Date(trainMs - 7 * 86400000).toISOString()
  const r = await sb(
    `cs_training_rsvp?training_date=eq.${dateStr}&rsvp_at=gte.${weekAgo}&status=eq.yes&select=rsvp_at`
  )
  const byDay = {}
  for (const row of r || []) {
    const d = row.rsvp_at.slice(0, 10)
    byDay[d] = (byDay[d] || 0) + 1
  }
  return byDay
}

async function newSubscribersLast24h() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const r = await sb(`cs_telegram_subscriber?subscribed_at=gte.${since}&select=telegram_user_id`)
  return r?.length || 0
}

async function newRsvpsLast24h(dateStr) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const r = await sb(
    `cs_training_rsvp?training_date=eq.${dateStr}&rsvp_at=gte.${since}&status=eq.yes&select=telegram_user_id`
  )
  return r?.length || 0
}

function daysUntil(dateStr) {
  const t = new Date(dateStr + 'T16:00:00+08:00').getTime()
  return Math.max(0, Math.round((t - Date.now()) / 86400000))
}

function bar(n, max = 30, width = 12) {
  const filled = Math.round((n / Math.max(max, 1)) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

async function daily() {
  const [subs, newSubs, yes, no, joined, newYes, bucket] = await Promise.all([
    countSubscribers(),
    newSubscribersLast24h(),
    countRsvps(trainingDate, 'yes'),
    countRsvps(trainingDate, 'no'),
    countJoinedRoom(trainingDate),
    newRsvpsLast24h(trainingDate),
    recentDailyBuckets(trainingDate),
  ])

  const d = daysUntil(trainingDate)
  const today = new Date().toISOString().slice(0, 10)

  const trendLines = []
  // Build 7-day trend ending today
  const bucketMax = Math.max(1, ...Object.values(bucket))
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    const label = new Date(day + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    const n = bucket[day] || 0
    const mark = day === today ? '  ← today' : ''
    trendLines.push(`${label}  ${bar(n, bucketMax)}  ${String(n).padStart(3)}${mark}`)
  }

  const pht = phtNow()
  const dateHeader = pht.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

  const text =
`📊 <b>DAILY RSVP UPDATE — ${dateHeader}</b>
Monday session: ${d} day${d === 1 ? '' : 's'} away

<pre>Subscribers       ${subs}
New today         ${newSubs}  ↑
RSVP'd Yes        ${yes}
RSVP'd No         ${no}
New RSVPs today   ${newYes}
In Training Room  ${joined} of ${yes}</pre>

📈 <b>Daily RSVP intake this week</b>
<pre>${trendLines.join('\n')}</pre>

<a href="https://chatstars.monday.com/boards/18431281189">Open Monday HIRING board</a>`

  if (DRY) { console.log(text); return }
  const r = await sendTracked({
    chat_id: OPS_CHAT_ID,
    message_thread_id: OPS_TOPIC_ID,
    text,
    kind: 'ops_daily',
    delete_after_hours: 30,  // keeps topic clean — superseded by next day's
  })
  console.log(r.ok ? `  ✓ daily digest posted msg_id=${r.message_id}` : `  ✗ ${r.error}`)
}

async function monday() {
  const [yes, joined, newYes] = await Promise.all([
    countRsvps(trainingDate, 'yes'),
    countJoinedRoom(trainingDate),
    newRsvpsLast24h(trainingDate),
  ])
  const expected = Math.round(yes * 0.66)  // 66% historical show-rate placeholder

  const text =
`<b>CHATSTARS TRAINING — Today, 4:00pm PHT</b>

<pre>Confirmed RSVPs       ${yes}
Expected attendance   ~${expected}  (66% historical)
In Training Room      ${joined}  (${yes ? Math.round((joined / yes) * 100) : 0}%)
New since Sunday      ${newYes}</pre>

<a href="https://chatstars.monday.com/boards/18431281189">Open Monday HIRING board</a>

Reminder: DM the bot <code>/meet &lt;link&gt;</code> before 3pm PHT.`

  if (DRY) { console.log(text); return }
  const r = await sendTracked({
    chat_id: OPS_CHAT_ID,
    message_thread_id: OPS_TOPIC_ID,
    text,
    kind: 'ops_monday',
    delete_after_hours: 12,
  })
  console.log(r.ok ? `  ✓ monday brief posted msg_id=${r.message_id}` : `  ✗ ${r.error}`)
}

async function main() {
  console.log(`── telegram_ops_digest mode=${MODE} ${DRY ? 'DRY' : 'LIVE'} · PHT=${phtNow().toISOString()}`)
  if (MODE === 'daily') return daily()
  if (MODE === 'monday') return monday()
  throw new Error(`unknown --mode=${MODE}`)
}

main().catch(e => { console.error(e); process.exit(1) })
