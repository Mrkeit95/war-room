export type Reminder = {
  id: string
  text: string
  done: boolean
  createdAt: number
  dueDate?: string         // ISO YYYY-MM-DD (one-shot)
  recurrence?: Recurrence  // recurring reminder — surfaces on briefing until done
}

/**
 * Recurrence patterns:
 * - 'daily' → surface every day
 * - 'weekdays' → Mon–Fri
 * - 'weekly:0' through 'weekly:6' → that specific weekday (Sun=0..Sat=6)
 */
export type Recurrence = 'daily' | 'weekdays' | `weekly:${0 | 1 | 2 | 3 | 4 | 5 | 6}`

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function recurrenceLabel(r: Recurrence | undefined): string {
  if (!r) return ''
  if (r === 'daily') return 'Every day'
  if (r === 'weekdays') return 'Every weekday'
  if (r.startsWith('weekly:')) {
    const n = parseInt(r.slice(7), 10)
    return `Every ${WEEKDAY_NAMES[n] ?? '?'}`
  }
  return ''
}

export function isRecurringActiveToday(r: Recurrence | undefined, now: Date = new Date()): boolean {
  if (!r) return false
  if (r === 'daily') return true
  const day = now.getDay()
  if (r === 'weekdays') return day >= 1 && day <= 5
  if (r.startsWith('weekly:')) return parseInt(r.slice(7), 10) === day
  return false
}

/** Server row shape from /api/reminders. */
type ServerReminder = {
  id: string
  text: string
  done: boolean
  created_at: string
  due_date: string | null
  recurrence: string | null
}

function fromServer(r: ServerReminder): Reminder {
  return {
    id: r.id,
    text: r.text,
    done: r.done,
    createdAt: new Date(r.created_at).getTime(),
    dueDate: r.due_date ?? undefined,
    recurrence: (r.recurrence ?? undefined) as Recurrence | undefined,
  }
}

export async function fetchAllReminders(): Promise<Reminder[]> {
  const r = await fetch('/api/reminders', { cache: 'no-store' })
  if (!r.ok) throw new Error(`Failed to load reminders (${r.status})`)
  const data = await r.json()
  return (data.reminders as ServerReminder[]).map(fromServer)
}

export async function createReminderApi(input: { text: string; dueDate?: string; recurrence?: Recurrence }): Promise<Reminder> {
  const r = await fetch('/api/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: input.text, due_date: input.dueDate ?? null, recurrence: input.recurrence ?? null }),
  })
  if (!r.ok) throw new Error(`Failed to create reminder (${r.status})`)
  const data = await r.json()
  return fromServer(data.reminder as ServerReminder)
}

export async function updateReminderApi(
  id: string,
  patch: { text?: string; done?: boolean; dueDate?: string | null; recurrence?: Recurrence | null }
): Promise<Reminder> {
  const body: Record<string, unknown> = { id }
  if (patch.text !== undefined) body.text = patch.text
  if (patch.done !== undefined) body.done = patch.done
  if (patch.dueDate !== undefined) body.due_date = patch.dueDate
  if (patch.recurrence !== undefined) body.recurrence = patch.recurrence
  const r = await fetch('/api/reminders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Failed to update reminder (${r.status})`)
  const data = await r.json()
  return fromServer(data.reminder as ServerReminder)
}

export async function deleteReminderApi(id: string): Promise<void> {
  const r = await fetch(`/api/reminders?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`Failed to delete reminder (${r.status})`)
}

/**
 * Legacy localStorage helpers — kept for the one-shot migration of any
 * reminders still stored locally on a user's browser. Once migrateLocalStorage()
 * has run successfully, we clear them.
 */
const STORAGE_KEY = 'war-room.reminders'
const MIGRATED_KEY = 'war-room.reminders-migrated'

export function loadLocalReminders(): Reminder[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export async function migrateLocalReminders(): Promise<number> {
  if (typeof window === 'undefined') return 0
  if (window.localStorage.getItem(MIGRATED_KEY)) return 0
  const local = loadLocalReminders()
  if (local.length === 0) {
    window.localStorage.setItem(MIGRATED_KEY, new Date().toISOString())
    return 0
  }
  let uploaded = 0
  for (const r of local) {
    try {
      await createReminderApi({ text: r.text, dueDate: r.dueDate, recurrence: r.recurrence })
      uploaded += 1
    } catch { /* swallow — best-effort migration */ }
  }
  window.localStorage.removeItem(STORAGE_KEY)
  window.localStorage.setItem(MIGRATED_KEY, new Date().toISOString())
  return uploaded
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISO(new Date())
}

function nextWeekday(target: number, now: Date, modifier: 'this' | 'next' | 'plain'): Date {
  const result = new Date(now)
  result.setHours(0, 0, 0, 0)
  const currentDay = result.getDay()
  let diff = (target - currentDay + 7) % 7
  if (modifier === 'next') {
    // "next friday" means the friday in the following week (skip the closest one if it's this week)
    if (diff === 0) diff = 7
    else diff += 7
  } else if (modifier === 'plain') {
    // "friday" — closest upcoming; if today, treat as next week
    if (diff === 0) diff = 7
  } else {
    // "this friday" — upcoming or today
    // diff stays as is
  }
  result.setDate(result.getDate() + diff)
  return result
}

export type RecurrenceResult = { recurrence: Recurrence; matchedText: string; cleaned: string } | null

/**
 * Detect recurrence patterns in reminder text. Run BEFORE parseDueDate so
 * "every monday" isn't misread as a one-off next-Monday date.
 */
export function parseRecurrence(text: string): RecurrenceResult {
  const lower = text.toLowerCase()
  const patterns: { regex: RegExp; recur: (m: RegExpExecArray) => Recurrence | null }[] = [
    { regex: /\b(every\s?day|everyday|daily)\b/, recur: () => 'daily' },
    { regex: /\b(every weekday|weekdays|every business day)\b/, recur: () => 'weekdays' },
    {
      regex: /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/,
      recur: (m) => {
        const map: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
          sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2,
          wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
        }
        const day = map[m[1]]
        return day === undefined ? null : (`weekly:${day}` as Recurrence)
      },
    },
    { regex: /\b(weekly|each week|every week)\b/, recur: () => `weekly:${new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6}` as Recurrence },
  ]
  for (const { regex, recur } of patterns) {
    const m = regex.exec(lower)
    if (!m) continue
    const recurrence = recur(m)
    if (!recurrence) continue
    const start = m.index
    const end = start + m[0].length
    let cleaned = (text.slice(0, start) + ' ' + text.slice(end)).replace(/\s+/g, ' ').trim()
    cleaned = cleaned.replace(/\b(on|by|at)\s*$/i, '').trim()
    return { recurrence, matchedText: m[0], cleaned }
  }
  return null
}

export type ParseResult = { dueDate: string; matchedText: string; cleaned: string } | null

export function parseDueDate(text: string, now: Date = new Date()): ParseResult {
  const lower = text.toLowerCase()

  const patterns: { regex: RegExp; compute: (m: RegExpExecArray) => Date | null }[] = [
    {
      regex: /\b(today|tonight)\b/,
      compute: () => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d },
    },
    {
      regex: /\btomorrow\b/,
      compute: () => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d },
    },
    {
      regex: /\bin (\d{1,2}) days?\b/,
      compute: (m) => {
        const n = parseInt(m[1], 10)
        if (n < 0 || n > 60) return null
        const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d
      },
    },
    {
      regex: /\b(this|next|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/,
      compute: (m) => {
        const mod = m[1] === 'this' ? 'this' : m[1] === 'next' ? 'next' : 'plain'
        const dayName = m[2]
        const idx = WEEKDAYS.indexOf(dayName) >= 0 ? WEEKDAYS.indexOf(dayName) : WEEKDAY_SHORT.indexOf(dayName)
        if (idx < 0) return null
        return nextWeekday(idx, now, mod as 'this' | 'next' | 'plain')
      },
    },
    {
      regex: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
      compute: (m) => {
        const idx = WEEKDAYS.indexOf(m[1])
        if (idx < 0) return null
        return nextWeekday(idx, now, 'plain')
      },
    },
  ]

  for (const { regex, compute } of patterns) {
    const match = regex.exec(lower)
    if (!match) continue
    const date = compute(match)
    if (!date) continue
    const matched = match[0]
    // Strip the matched phrase from original text (case-insensitive at the original index)
    const start = match.index
    const end = start + matched.length
    let cleaned = (text.slice(0, start) + ' ' + text.slice(end)).replace(/\s+/g, ' ').trim()
    // Trim trailing/leading prepositions left dangling
    cleaned = cleaned.replace(/\b(on|by|at)\s*$/i, '').trim()
    return { dueDate: toISO(date), matchedText: matched, cleaned }
  }

  return null
}

export function formatDueLabel(iso: string, now: Date = new Date()): string {
  const due = new Date(iso + 'T00:00:00')
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff <= 6) return due.toLocaleDateString('en-US', { weekday: 'long' })
  if (diff < -1 && diff >= -6) return `${due.toLocaleDateString('en-US', { weekday: 'long' })} (overdue)`
  if (diff < 0) return `${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (overdue)`
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function isOverdue(iso: string | undefined, now: Date = new Date()): boolean {
  if (!iso) return false
  return iso < todayISO()
}

export function isDueToday(iso: string | undefined): boolean {
  if (!iso) return false
  return iso === todayISO()
}
