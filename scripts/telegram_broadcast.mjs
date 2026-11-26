// Weekly broadcast cron.
// Fires Mon / Wed / Fri at 11am PHT. Posts a rotating nag to the main
// ChatStars group with a "Message the bot" button. Before posting,
// deletes the previous nag so the group never has more than one.
// (The pinned "big reveal" announcement is separate and never deleted.)
//
// Env:
//   TG_BOT_TOKEN, SUPABASE_*, TG_MAIN_GROUP_CHAT_ID
//
// Flags:
//   --dry             don't actually send, just show what it would do
//   --variant=v1|v2|v3  force a specific variant (default: pick by day-of-week)

import process from 'node:process'
import { M, sb, sendTracked, deleteMsg, phtNow } from './telegram_lib.mjs'

const DRY  = process.argv.includes('--dry')
const FORCE = (process.argv.find(a => a.startsWith('--variant=')) || '').split('=')[1] || ''

const MAIN_CHAT_ID = Number(process.env.TG_MAIN_GROUP_CHAT_ID)
if (!MAIN_CHAT_ID) throw new Error('TG_MAIN_GROUP_CHAT_ID missing')

const BOT_URL = 'https://t.me/ChatstarsHiringBot?start=bulk'

const VARIANTS = {
  v1: {
    label: 'V1 — Monday — system upgrade announcement',
    text:
`📣 <b>ChatStars is leveling up</b>

We've just launched a new Telegram reminder system — now you can get training updates, RSVPs, and the Google Meet link delivered straight to your Telegram DM so you never miss a session.

A quick reminder of where we stand:

• Ranked among the <b>top 2 chat agencies in the world</b>
• Generating over <b>$10 million per month</b> in client sales
• Chatters earning <b>$1,500 to $12,000 USD / month</b>
• 48-hour work weeks, fully remote

To continue your journey with us, tap below to message the bot and get set up.`,
  },
  v2: {
    label: 'V2 — Wednesday — motivational opportunity',
    text:
`🚀 <b>This is your reminder</b>

ChatStars is one of the <b>top 2 ranked chat agencies worldwide</b>. Our clients generate over <b>$10 million per month</b> in sales, and our chatters earn between <b>$1,500 and $12,000 USD per month</b> — fully remote, 48-hour work weeks.

If you're serious about joining this cohort, it starts with one thing: tapping below to message our bot. You'll get the Google Meet link and daily reminders delivered straight to your Telegram.

Don't miss your chance. Monday's session is coming.`,
  },
  v3: {
    label: 'V3 — Friday — final call urgency',
    text:
`⚠️ <b>Final call for this cohort</b>

Monday's training at 4:00pm PHT is the gateway to earning <b>$1,500 to $12,000 USD per month</b> as a ChatStars chatter.

A quick recap of who we are:

• One of the <b>top 2 chat agencies in the world</b>
• <b>$10 million per month</b> in client sales
• 48-hour work weeks, fully remote
• Free in-house training to get you earning

Get the Meet link and reminders delivered straight to your Telegram. Tap below to message the bot and claim your seat.`,
  },
}

function pickVariant() {
  if (FORCE && VARIANTS[FORCE]) return FORCE
  // PHT day of week: Mon = 1, Wed = 3, Fri = 5
  const dow = phtNow().getUTCDay()
  if (dow === 1) return 'v1'
  if (dow === 3) return 'v2'
  if (dow === 5) return 'v3'
  // Not a broadcast day — exit cleanly (saves accidental fires from manual runs)
  return null
}

async function deletePreviousNag() {
  // Fetch most recent not-deleted nag for this chat and remove it
  const rows = await sb(
    `cs_telegram_bot_message?chat_id=eq.${MAIN_CHAT_ID}&kind=eq.nag&deleted_at=is.null&order=posted_at.desc&limit=1&select=message_id`
  )
  if (!rows?.length) return 0
  const prev = rows[0].message_id
  const ok = DRY ? true : await deleteMsg(MAIN_CHAT_ID, prev)
  console.log(`  previous nag ${prev}: ${ok ? 'deleted' : 'FAILED'}`)
  return ok ? 1 : 0
}

async function main() {
  const variant = pickVariant()
  console.log(`── telegram_broadcast ${DRY ? 'DRY' : 'LIVE'} · PHT=${phtNow().toISOString()} · variant=${variant || '(none)'}`)
  if (!variant) {
    console.log('Not a broadcast day — exiting.')
    return
  }

  const v = VARIANTS[variant]
  console.log(`  posting: ${v.label}`)

  // Nuke previous nag so the group only ever has 1 floating
  await deletePreviousNag()

  if (DRY) {
    console.log('— DRY — would post:')
    console.log(v.text)
    return
  }

  const r = await sendTracked({
    chat_id: MAIN_CHAT_ID,
    text: v.text,
    reply_markup: { inline_keyboard: [[{ text: '💬 Message the bot', url: BOT_URL }]] },
    kind: 'nag',
    variant,
    // No delete_after — the next nag will remove this one
  })
  console.log(r.ok ? `  ✓ posted msg_id=${r.message_id}` : `  ✗ ${r.error}`)
}

main().catch(e => { console.error(e); process.exit(1) })
