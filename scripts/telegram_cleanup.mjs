// Group-chat cleanup cron. Runs every 2 minutes.
//
// Deletes any bot-posted message whose delete_after has passed:
//   • Welcome tags that have been floating 10 min with no /start
//       → ALSO kicks the user from the main group (ban + unban)
//         so they can rejoin later via the invite link if they want
//   • Meet-post messages past their lifespan
//   • Ops alerts past their lifespan
//
// Nag rotation deletes are handled inline by telegram_broadcast.mjs (not
// by delete_after), so they aren't in this cron's scope.
//
// For each candidate: calls Telegram's deleteMessage, then flags the row
// deleted_at in Supabase. Soft-fails on individual messages so one bad row
// doesn't stop the batch.

import process from 'node:process'
import { M, sb } from './telegram_lib.mjs'

const DRY = process.argv.includes('--dry')

async function isSubscribed(userId) {
  try {
    const rows = await sb(
      `cs_telegram_subscriber?telegram_user_id=eq.${userId}&select=telegram_user_id,unsubscribed_at`
    )
    if (!rows?.length) return false
    return !rows[0].unsubscribed_at
  } catch {
    return false
  }
}

async function main() {
  const nowIso = new Date().toISOString()
  const due = await sb(
    `cs_telegram_bot_message?deleted_at=is.null&delete_after=lt.${nowIso}&order=delete_after.asc&limit=500&select=id,chat_id,message_id,kind,for_user_id`
  )
  console.log(`── telegram_cleanup ${DRY ? 'DRY' : 'LIVE'} · ${due?.length || 0} messages due`)
  if (!due?.length) return

  let ok = 0, failed = 0, kicked = 0, skipped = 0
  for (const row of due) {
    if (DRY) {
      console.log(`  [DRY] would delete ${row.kind} #${row.message_id} in chat ${row.chat_id}`)
      if (row.kind === 'welcome' && row.for_user_id) {
        const sub = await isSubscribed(row.for_user_id)
        console.log(`        [DRY] user ${row.for_user_id} subscribed=${sub} → ${sub ? 'keep' : 'would kick'}`)
      }
      ok++
      continue
    }

    // Delete the welcome/meet/ops message itself
    const r = await M('deleteMessage', { chat_id: row.chat_id, message_id: row.message_id })
    const deleted = r.ok || /message to delete not found/i.test(r.description || '')
    try {
      await sb(`cs_telegram_bot_message?id=eq.${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      })
    } catch (e) {
      console.warn(`  failed to mark row ${row.id} deleted:`, e.message)
    }

    if (deleted) ok++
    else { failed++; console.warn(`  ✗ ${row.kind} #${row.message_id}: ${r.description}`) }

    // For expired welcomes: if the user never subscribed to the bot, kick
    // them from the group so the chat stays clean (announcements only).
    if (row.kind === 'welcome' && row.for_user_id) {
      const sub = await isSubscribed(row.for_user_id)
      if (sub) {
        skipped++
      } else {
        const ban = await M('banChatMember', { chat_id: row.chat_id, user_id: row.for_user_id })
        // Unban right after so they can rejoin via invite link later
        await M('unbanChatMember', { chat_id: row.chat_id, user_id: row.for_user_id, only_if_banned: true })
        if (ban.ok) {
          kicked++
          console.log(`  ⤬ kicked user ${row.for_user_id} from chat ${row.chat_id} (no /start within TTL)`)
        } else {
          console.warn(`  ✗ failed to kick ${row.for_user_id}: ${ban.description}`)
        }
      }
    }

    await new Promise(x => setTimeout(x, 40))
  }

  console.log(`\n── done: deleted=${ok}, failed=${failed}, kicked=${kicked}, kept-subscribed=${skipped}`)
}

main().catch(e => { console.error(e); process.exit(1) })
