export type Reminder = {
  id: string
  text: string
  done: boolean
  createdAt: number
  dueDate?: string // ISO YYYY-MM-DD
}

const STORAGE_KEY = 'war-room.reminders'

export function loadReminders(): Reminder[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function saveReminders(items: Reminder[]) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch {}
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
