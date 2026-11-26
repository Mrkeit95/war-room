// Daily DM nudge cron. Fires at 10am PHT.
//
// For every active subscriber, DM them one message tailored to their state:
//   • Not RSVP'd yet       → push-to-RSVP copy (rotates by day-of-week)
//   • RSVP'd yes           → motivational countdown (rotates by days-to-training)
//   • RSVP'd no            → skipped (they already declined this week)
//
// Dedupes via cs_telegram_nudge_log (unique on (user, training_date, nudge_day))
// so a manual rerun on the same day is a no-op, not a double-send.
//
// Skips users who subscribed <24h ago (they already got the welcome).

import process from 'node:process'
import { M, sb, phtNow, nextMondayISO, friendlyDate } from './telegram_lib.mjs'

const DRY   = process.argv.includes('--dry')
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0)

const trainingDate = nextMondayISO()
const trainingMs   = new Date(trainingDate + 'T16:00:00+08:00').getTime()
const today        = new Date().toISOString().slice(0, 10)

function daysUntil() {
  return Math.max(0, Math.round((trainingMs - Date.now()) / 86400000))
}

const d = daysUntil()

// ─────────── NON-RSVP'D copy, rotates by day-until-training ───────────
const NAG_VARIANTS = [
  // 0 days (training today)
  { key: `nag_d0`, text: `Training TODAY at 4:00pm PHT, {name}. Last chance to confirm — tap below to lock your seat.` },
  // 1
  { key: `nag_d1`, text: `Training TOMORROW 4:00pm PHT, {name}. Haven't RSVP'd yet? One tap below.` },
  // 2
  { key: `nag_d2`, text: `2 days to go, {name}. ChatStars chatters are earning \$1,500 to \$12,000 USD / month. Lock your seat for Monday.` },
  // 3
  { key: `nag_d3`, text: `3 days until Monday's training. {name}, this could be the start of a career that pays up to \$12k/month from your laptop. Confirm your seat below.` },
  // 4
  { key: `nag_d4`, text: `{name} — Monday training 4pm PHT, 4 days away. Tap below to RSVP and get the Meet link when it drops.` },
  // 5
  { key: `nag_d5`, text: `5 days to go. Still haven't confirmed, {name}? Tap below — takes one tap and you're in.` },
  // 6
  { key: `nag_d6`, text: `{name}, Monday training is 6 days out. Our top chatters started exactly where you are right now. Don't let the moment pass — RSVP below.` },
  // 7+
  { key: `nag_d7`, text: `Welcome, {name}. Monday training at 4pm PHT is where the earning starts. Tap below to RSVP.` },
]

// ─────────── RSVP'D YES copy, motivational, rotates by days-left ───────
const YES_VARIANTS = [
  // 0 days
  { key: `yes_d0`, text: `TODAY, {name}! Training starts at 4:00pm PHT. We'll DM you the Meet link in 1 hour. Get your laptop ready. 💪` },
  // 1
  { key: `yes_d1`, text: `Tomorrow is the day, {name}. 4:00pm PHT. One session is all it takes to get you earning. See you in the Training Room. 🔥` },
  // 2
  { key: `yes_d2`, text: `2 days, {name}. Imagine your bank account 90 days from now — this Monday is the first step. We're ready.` },
  // 3
  { key: `yes_d3`, text: `3 days to go, {name}. The chatters earning \$10k/month this year started exactly where you are. Keep that momentum.` },
  // 4
  { key: `yes_d4`, text: `4 days, {name}. You're officially on the list. We're betting on you. 🚀` },
  // 5
  { key: `yes_d5`, text: `{name}, 5 days until a career that pays \$1.5k to \$12k/month. Can you believe it starts this Monday?` },
  // 6
  { key: `yes_d6`, text: `You're in, {name}! You're one step closer to earning up to \$12k/month from your laptop. Monday, 4:00pm PHT.` },
  // 7+
  { key: `yes_d7`, text: `Confirmed, {name}. Monday 4:00pm PHT. Save the chat — we'll DM the Meet link 1 hour before start.` },
]

function pickVariant(list) {
  const idx = Math.min(d, list.length - 1)
  return list[idx]
}

async function fetchSubscribers() {
  // Active, non-blocked, subscribed >24h ago
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  return await sb(
    `cs_telegram_subscriber?unsubscribed_at=is.null&subscribed_at=lt.${cutoff}&select=telegram_user_id,first_name,telegram_username&order=subscribed_at.asc`
  )
}

async function rsvpStatus(uid) {
  const rows = await sb(
    `cs_training_rsvp?telegram_user_id=eq.${uid}&training_date=eq.${trainingDate}&select=status`
  )
  return rows?.[0]?.status || null
}

async function alreadyNudgedToday(uid) {
  const rows = await sb(
    `cs_telegram_nudge_log?telegram_user_id=eq.${uid}&training_date=eq.${trainingDate}&nudge_day=eq.${d}&select=id`
  )
  return !!rows?.length
}

async function recordNudge(uid, variantKey) {
  try {
    await sb('cs_telegram_nudge_log', {
      method: 'POST',
      body: JSON.stringify({
        telegram_user_id: uid,
        training_date: trainingDate,
        nudge_day: d,
        variant: variantKey,
      }),
    })
  } catch (e) {
    // Unique-violation = raced with ourselves, ignore
    if (!String(e.message || '').includes('duplicate')) console.warn('nudge log insert:', e.message)
  }
}

async function dmUser({ uid, text, status }) {
  const body = {
    chat_id: uid,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }
  if (status !== 'yes') {
    body.reply_markup = {
      inline_keyboard: [[{ text: '✓ Yes, I\'ll attend', callback_data: `rsvp:yes:${trainingDate}` }]],
    }
  }
  return await M('sendMessage', body)
}

async function main() {
  console.log(`── telegram_daily_nudges ${DRY ? 'DRY' : 'LIVE'} · training=${trainingDate} · d-${d} · PHT=${phtNow().toISOString()}`)

  const subs = await fetchSubscribers()
  console.log(`  ${subs.length} active subscribers`)

  let sent = 0, skipped = 0, failed = 0
  for (const s of subs) {
    if (LIMIT && sent >= LIMIT) break

    if (await alreadyNudgedToday(s.telegram_user_id)) { skipped++; continue }

    const status = await rsvpStatus(s.telegram_user_id)
    if (status === 'no') { skipped++; continue }  // they said no, leave them alone this week

    const variant = status === 'yes' ? pickVariant(YES_VARIANTS) : pickVariant(NAG_VARIANTS)
    const name = s.first_name || 'there'
    const text = variant.text.replaceAll('{name}', name)

    if (DRY) {
      console.log(`  [DRY] ${name} (${status || 'no-rsvp'}) → ${variant.key}`)
      sent++
      continue
    }

    const r = await dmUser({ uid: s.telegram_user_id, text, status })
    if (r.ok) {
      await recordNudge(s.telegram_user_id, variant.key)
      sent++
    } else {
      // Common failure: user blocked bot. Auto-unsubscribe.
      if (/bot was blocked|chat not found|user is deactivated/i.test(r.description || '')) {
        await sb(`cs_telegram_subscriber?telegram_user_id=eq.${s.telegram_user_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ unsubscribed_at: new Date().toISOString() }),
        })
      }
      failed++
    }

    // Rate-limit ourselves below Telegram's 30 msg/s global limit
    await new Promise(x => setTimeout(x, 50))
  }

  console.log(`\n── done: sent=${sent}, skipped=${skipped}, failed=${failed}`)
}

main().catch(e => { console.error(e); process.exit(1) })
