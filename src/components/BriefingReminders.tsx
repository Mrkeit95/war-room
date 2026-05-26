'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatDueLabel, isDueToday, isOverdue, isRecurringActiveToday, loadReminders, recurrenceLabel, saveReminders, type Reminder } from '@/lib/reminders'

export default function BriefingReminders() {
  const [items, setItems] = useState<Reminder[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setItems(loadReminders())
    setHydrated(true)
  }, [])

  if (!hydrated) return null

  const overdue = items.filter(r => !r.done && isOverdue(r.dueDate))
  const today = items.filter(r => !r.done && (isDueToday(r.dueDate) || isRecurringActiveToday(r.recurrence)))

  if (overdue.length === 0 && today.length === 0) return null

  const toggle = (id: string) => {
    const next = items.map(r => r.id === id ? { ...r, done: !r.done } : r)
    setItems(next)
    saveReminders(next)
  }

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 24, height: 1, background: 'var(--text-3)', display: 'inline-block' }} />
        Your reminders for today
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {overdue.map(r => (
          <Row key={r.id} reminder={r} onToggle={() => toggle(r.id)} tone="overdue" />
        ))}
        {today.map(r => (
          <Row key={r.id} reminder={r} onToggle={() => toggle(r.id)} tone="today" />
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 10, textAlign: 'right' }}>
        <Link href="/" style={{ color: 'var(--text-4)', textDecoration: 'none' }}>Manage on dashboard →</Link>
      </div>
    </div>
  )
}

function Row({ reminder, onToggle, tone }: { reminder: Reminder; onToggle: () => void; tone: 'overdue' | 'today' }) {
  const accent = tone === 'overdue' ? 'var(--red)' : 'var(--amber)'
  const label = reminder.recurrence
    ? recurrenceLabel(reminder.recurrence)
    : reminder.dueDate ? formatDueLabel(reminder.dueDate) : ''
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '14px 18px', display: 'flex', gap: 14, borderLeft: `2px solid ${accent}`,
      alignItems: 'center',
    }}>
      <button
        onClick={onToggle}
        aria-label="Mark done"
        style={{
          width: 18, height: 18, borderRadius: 4,
          border: `1px solid var(--border-strong)`,
          background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, padding: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4, marginBottom: 2 }}>{reminder.text}</div>
        {label && (
          <div style={{ fontSize: 11.5, color: accent, fontWeight: 500 }}>{label}</div>
        )}
      </div>
      <span style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
        padding: '3px 8px', borderRadius: 5, fontWeight: 500,
        background: tone === 'overdue' ? 'rgba(239,68,68,0.10)' : 'rgba(251,191,36,0.10)',
        color: accent, whiteSpace: 'nowrap',
      }}>{tone === 'overdue' ? 'Overdue' : 'Today'}</span>
    </div>
  )
}
