// Shared helpers for every telegram cron script.
//
//   M(method, body)             — POST to Telegram Bot API, returns JSON
//   sb(path, opts)              — raw fetch to Supabase REST, returns JSON
//   sendTracked(opts, meta)     — sendMessage + record row in cs_telegram_bot_message
//   deleteMsg(chat_id, msg_id)  — deleteMessage + mark row deleted_at
//   phtNow(), phtDateISO()      — PHT (UTC+8) time helpers
//   nextMondayISO()             — YYYY-MM-DD of next Monday in UTC (matches webhook)
//
// Every script expects these env vars:
//   TG_BOT_TOKEN
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Targets (one per cron, passed to the functions directly):
//   TG_OPS_CHAT_ID + TG_RSVP_TOPIC_ID    — ops digest + Monday brief
//   TG_MAIN_GROUP_CHAT_ID                 — broadcasts + welcomes
//   TG_TRAINING_ROOM_CHAT_ID              — meet link posting

import process from 'node:process'

const TOKEN = process.env.TG_BOT_TOKEN
if (!TOKEN) throw new Error('TG_BOT_TOKEN missing')

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB_URL || !SB_KEY) throw new Error('Supabase env missing')

export const TG_API = `https://api.telegram.org/bot${TOKEN}`

export async function M(method, body = {}) {
  const r = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!j.ok) console.warn(`tg ${method} failed:`, j.description || j)
  return j
}

export async function sb(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`supabase ${path}: ${r.status} ${t}`)
  return t ? JSON.parse(t) : null
}

// Send a message to a chat (optionally a topic) and record it so cleanup
// can delete it later. Returns { ok, message_id }.
export async function sendTracked({ chat_id, message_thread_id, text, reply_markup, parse_mode = 'HTML', disable_web_page_preview = true, kind, for_user_id, variant, delete_after_hours }) {
  const body = { chat_id, text, parse_mode, disable_web_page_preview }
  if (message_thread_id) body.message_thread_id = message_thread_id
  if (reply_markup) body.reply_markup = reply_markup

  const resp = await M('sendMessage', body)
  if (!resp.ok) return { ok: false, error: resp.description }

  const msg_id = resp.result.message_id
  const delete_after = delete_after_hours
    ? new Date(Date.now() + delete_after_hours * 3600 * 1000).toISOString()
    : null

  try {
    await sb('cs_telegram_bot_message', {
      method: 'POST',
      body: JSON.stringify({
        chat_id,
        message_thread_id: message_thread_id || null,
        message_id: msg_id,
        kind,
        for_user_id: for_user_id || null,
        variant: variant || null,
        delete_after,
      }),
    })
  } catch (e) {
    console.warn('failed to record bot_message row:', e.message)
  }
  return { ok: true, message_id: msg_id }
}

export async function deleteMsg(chat_id, message_id) {
  const r = await M('deleteMessage', { chat_id, message_id })
  if (r.ok) {
    try {
      await sb(`cs_telegram_bot_message?chat_id=eq.${chat_id}&message_id=eq.${message_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      })
    } catch (e) {
      console.warn(`failed to flag ${message_id} deleted in DB:`, e.message)
    }
  }
  return r.ok
}

// PHT = UTC+8.
export function phtNow() {
  return new Date(Date.now() + 8 * 3600 * 1000)
}
export function phtDateISO() {
  return phtNow().toISOString().slice(0, 10)
}

// Next Monday in UTC, YYYY-MM-DD. If today IS Monday, returns today.
// Matches the webhook's nextMondayISO so both sides agree on training_date.
export function nextMondayISO(from = new Date()) {
  const d = new Date(from)
  const dow = d.getUTCDay()
  const daysUntilMonday = dow === 1 ? 0 : (8 - dow) % 7
  d.setUTCDate(d.getUTCDate() + daysUntilMonday)
  return d.toISOString().slice(0, 10)
}

export function friendlyDate(iso) {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}
