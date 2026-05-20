'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  formatDueLabel,
  isOverdue,
  loadReminders,
  parseDueDate,
  saveReminders,
  type Reminder,
} from '@/lib/reminders'

export default function Reminders() {
  const [items, setItems] = useState<Reminder[]>([])
  const [draft, setDraft] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setItems(loadReminders())
    setHydrated(true)
  }, [])

  const parsed = useMemo(() => parseDueDate(draft), [draft])

  const add = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    const text = parsed ? parsed.cleaned || trimmed : trimmed
    const next: Reminder[] = [
      {
        id: crypto.randomUUID(),
        text,
        done: false,
        createdAt: Date.now(),
        dueDate: parsed?.dueDate,
      },
      ...items,
    ]
    setItems(next)
    saveReminders(next)
    setDraft('')
  }

  const toggle = (id: string) => {
    const next = items.map(r => r.id === id ? { ...r, done: !r.done } : r)
    setItems(next)
    saveReminders(next)
  }

  const remove = (id: string) => {
    const next = items.filter(r => r.id !== id)
    setItems(next)
    saveReminders(next)
  }

  const open = items.filter(r => !r.done)
  const done = items.filter(r => r.done)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500 }}>Your reminders</div>
        {hydrated && items.length > 0 && (
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-3)' }}>{open.length} open</div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 5,
            background: 'var(--surface-3)', color: 'var(--text-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, flexShrink: 0,
          }}>+</div>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder="Add a reminder… try “call Friday”"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>
        {parsed && (
          <div style={{ marginLeft: 32, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 10.5, padding: '2px 7px', borderRadius: 4, fontWeight: 500,
              background: 'rgba(96,165,250,0.10)', color: 'var(--blue)',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>
              </svg>
              Due {formatDueLabel(parsed.dueDate)}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>from “{parsed.matchedText}”</span>
          </div>
        )}
      </div>

      {!hydrated ? null : items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-4)', padding: '4px 0', fontStyle: 'italic' }}>
          Nothing on your list. Type above and hit Enter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {open.map(r => (
            <Item key={r.id} item={r} onToggle={() => toggle(r.id)} onRemove={() => remove(r.id)} />
          ))}
          {done.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-4)', fontWeight: 500, marginTop: 12, marginBottom: 4 }}>Done</div>
              {done.map(r => (
                <Item key={r.id} item={r} onToggle={() => toggle(r.id)} onRemove={() => remove(r.id)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Item({ item, onToggle, onRemove }: { item: Reminder; onToggle: () => void; onRemove: () => void }) {
  const [hover, setHover] = useState(false)
  const overdue = !item.done && isOverdue(item.dueDate)
  const dueLabel = item.dueDate ? formatDueLabel(item.dueDate) : null
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 6px', borderRadius: 6,
        background: hover ? 'var(--surface-2)' : 'transparent',
      }}
    >
      <button
        onClick={onToggle}
        aria-label={item.done ? 'Mark not done' : 'Mark done'}
        style={{
          width: 16, height: 16, borderRadius: 4,
          border: `1px solid ${item.done ? 'var(--green)' : 'var(--border-strong)'}`,
          background: item.done ? 'var(--green)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, padding: 0,
        }}
      >
        {item.done && (
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, lineHeight: 1.4,
          color: item.done ? 'var(--text-4)' : 'var(--text)',
          textDecoration: item.done ? 'line-through' : 'none',
          wordBreak: 'break-word',
        }}>{item.text}</div>
        {dueLabel && !item.done && (
          <div style={{
            fontSize: 10.5, marginTop: 2, fontWeight: 500,
            color: overdue ? 'var(--red)' : dueLabel === 'Today' ? 'var(--amber)' : 'var(--text-3)',
          }}>{dueLabel}</div>
        )}
      </div>
      {hover && (
        <button
          onClick={onRemove}
          aria-label="Delete reminder"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-4)', padding: 4, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  )
}
