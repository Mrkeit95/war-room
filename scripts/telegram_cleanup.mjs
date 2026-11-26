// Group-chat cleanup cron. Runs every hour.
//
// Deletes any bot-posted message whose delete_after has passed:
//   • Welcome tags that have been floating 24h with no /start
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

async function main() {
  const nowIso = new Date().toISOString()
  const due = await sb(
    `cs_telegram_bot_message?deleted_at=is.null&delete_after=lt.${nowIso}&order=delete_after.asc&limit=500&select=id,chat_id,message_id,kind`
  )
  console.log(`── telegram_cleanup ${DRY ? 'DRY' : 'LIVE'} · ${due?.length || 0} messages due`)
  if (!due?.length) return

  let ok = 0, failed = 0
  for (const row of due) {
    if (DRY) { console.log(`  [DRY] would delete ${row.kind} #${row.message_id} in chat ${row.chat_id}`); ok++; continue }

    const r = await M('deleteMessage', { chat_id: row.chat_id, message_id: row.message_id })
    const deleted = r.ok || /message to delete not found/i.test(r.description || '')
    // "message to delete not found" = already gone, treat as success
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

    await new Promise(x => setTimeout(x, 40))
  }

  console.log(`\n── done: ok=${ok}, failed=${failed}`)
}

main().catch(e => { console.error(e); process.exit(1) })
