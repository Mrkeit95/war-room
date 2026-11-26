// Google Meet link posting cron.
//
// Fires every 15 minutes from Monday 2:30pm PHT to 4:00pm PHT (UTC 6:30–8:00).
// On each tick, computes minutes-to-training:
//   • 60 min out  → posts Meet link in Training Room + DMs every RSVP'd user
//   • 15 min out  → posts "starting in 15 min" + DMs each
//   • 0 min out   → posts "live now" + DMs each
// Each of the three windows only fires once per training (tracked via
// cs_telegram_bot_message with kind = 'meet_post' / 'meet_dm' + variant=60|15|0).
//
// Pulls the week's Meet URL from cs_training_meet_link. If no URL set, sends
// an alert to the ops topic instead so admins know to run /meet.

import process from 'node:process'
import { M, sb, sendTracked, phtNow, nextMondayISO, friendlyDate } from './telegram_lib.mjs'

const DRY = process.argv.includes('--dry')

const TRAINING_ROOM_CHAT_ID = Number(process.env.TG_TRAINING_ROOM_CHAT_ID)
const OPS_CHAT_ID           = Number(process.env.TG_OPS_CHAT_ID)
const OPS_TOPIC_ID          = Number(process.env.TG_RSVP_TOPIC_ID)
if (!TRAINING_ROOM_CHAT_ID || !OPS_CHAT_ID || !OPS_TOPIC_ID) {
  throw new Error('TG_TRAINING_ROOM_CHAT_ID, TG_OPS_CHAT_ID, TG_RSVP_TOPIC_ID all required')
}

// Which Monday's training are we servicing? Must be TODAY (PHT) and PHT weekday 1.
function trainingToday() {
  const pht = phtNow()
  if (pht.getUTCDay() !== 1) return null  // only Mondays
  return pht.toISOString().slice(0, 10)
}

function minutesUntilTraining(dateStr) {
  const trainMs = new Date(dateStr + 'T16:00:00+08:00').getTime()
  return Math.round((trainMs - Date.now()) / 60000)
}

function pickWindow(mins) {
  if (mins <= 2   && mins >= -5)  return '0'
  if (mins <= 17  && mins >= 13)  return '15'
  if (mins <= 62  && mins >= 58)  return '60'
  return null
}

async function getMeetUrl(date) {
  const rows = await sb(`cs_training_meet_link?training_date=eq.${date}&select=meet_url`)
  return rows?.[0]?.meet_url || null
}

async function getRsvpedUsers(date) {
  return await sb(
    `cs_training_rsvp?training_date=eq.${date}&status=eq.yes&select=telegram_user_id,cs_telegram_subscriber(first_name,unsubscribed_at)`
  )
}

async function alreadyFired(date, windowLabel) {
  const rows = await sb(
    `cs_telegram_bot_message?chat_id=eq.${TRAINING_ROOM_CHAT_ID}&kind=eq.meet_post&variant=eq.${windowLabel}&select=id&limit=1`
  )
  return !!rows?.length
}

async function postMissingLinkAlert(date) {
  // One-off ops alert to the RSVP topic. Only post once per date.
  const rows = await sb(
    `cs_telegram_bot_message?chat_id=eq.${OPS_CHAT_ID}&message_thread_id=eq.${OPS_TOPIC_ID}&kind=eq.meet_alert&posted_at=gte.${date}T00:00:00Z&limit=1&select=id`
  )
  if (rows?.length) return
  await sendTracked({
    chat_id: OPS_CHAT_ID,
    message_thread_id: OPS_TOPIC_ID,
    text: `⚠️ <b>No Google Meet link set for today's training.</b>\n\nDM the bot <code>/meet https://meet.google.com/xxx-yyy-zzz</code> to set it. RSVP'd attendees are waiting.`,
    kind: 'meet_alert',
    delete_after_hours: 4,
  })
}

const BODIES = {
  '60': url => `🎥 <b>Training starts in 1 hour.</b>\n\nGoogle Meet: ${url}`,
  '15': url => `⏰ <b>Starting in 15 minutes.</b>\n\n${url}`,
  '0':  url => `🔴 <b>LIVE NOW — join:</b> ${url}`,
}

async function main() {
  console.log(`── telegram_meet_post ${DRY ? 'DRY' : 'LIVE'} · PHT=${phtNow().toISOString()}`)

  const date = trainingToday()
  if (!date) { console.log('Not Monday PHT — exiting.'); return }

  const mins = minutesUntilTraining(date)
  const win  = pickWindow(mins)
  console.log(`  training=${date} · mins_to=${mins} · window=${win || '(none)'}`)
  if (!win) return

  if (await alreadyFired(date, win)) {
    console.log(`  window ${win} already fired today, skip`)
    return
  }

  const url = await getMeetUrl(date)
  if (!url) {
    console.log(`  no meet link for ${date} — posting alert to ops`)
    if (!DRY) await postMissingLinkAlert(date)
    return
  }

  const body = BODIES[win](url)

  // 1. Post to Training Room
  if (!DRY) {
    await sendTracked({
      chat_id: TRAINING_ROOM_CHAT_ID,
      text: body,
      kind: 'meet_post',
      variant: win,
      delete_after_hours: 24,
    })
  }
  console.log(`  ✓ posted to Training Room`)

  // 2. DM every RSVP'd attendee
  const rsvped = await getRsvpedUsers(date)
  console.log(`  ${rsvped?.length || 0} RSVP'd users to DM`)
  let dmSent = 0, dmFailed = 0
  for (const r of rsvped || []) {
    if (r.cs_telegram_subscriber?.unsubscribed_at) continue
    if (DRY) { dmSent++; continue }
    const resp = await M('sendMessage', {
      chat_id: r.telegram_user_id,
      text: body,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    })
    if (resp.ok) dmSent++
    else dmFailed++
    await new Promise(x => setTimeout(x, 50))
  }
  console.log(`  DM result: sent=${dmSent}, failed=${dmFailed}`)
}

main().catch(e => { console.error(e); process.exit(1) })
