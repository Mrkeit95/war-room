'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  createReminderApi,
  deleteReminderApi,
  fetchAllReminders,
  formatDueLabel,
  isOverdue,
  migrateLocalReminders,
  parseDueDate,
  parseRecurrence,
  recurrenceLabel,
  updateReminderApi,
  type Reminder,
} from '@/lib/reminders'

export default function Reminders() {
  const [items, setItems] = useState<Reminder[]>([])
  const [draft, setDraft] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await migrateLocalReminders()
        const fresh = await fetchAllReminders()
        if (!cancelled) {
          setItems(fresh)
          setHydrated(true)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setHydrated(true)
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const recurrenceParsed = useMemo(() => parseRecurrence(draft), [draft])
  const remainingForDate = recurrenceParsed ? recurrenceParsed.cleaned : draft
  const dueParsed = useMemo(() => (recurrenceParsed ? null : parseDueDate(remainingForDate)), [recurrenceParsed, remainingForDate])

  const add = async () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    const baseText = recurrenceParsed ? recurrenceParsed.cleaned : (dueParsed ? dueParsed.cleaned : trimmed)
    const text = baseText || trimmed
    setDraft('')
    try {
      const created = await createReminderApi({
        text,
        dueDate: recurrenceParsed ? undefined : dueParsed?.dueDate,
        recurrence: recurrenceParsed?.recurrence,
      })
      setItems(prev => [created, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDraft(trimmed) // restore on failure
    }
  }

  const toggle = async (id: string) => {
    const target = items.find(r => r.id === id)
    if (!target) return
    setItems(prev => prev.map(r => r.id === id ? { ...r, done: !r.done } : r))
    try {
      await updateReminderApi(id, { done: !target.done })
    } catch (err) {
      // Revert
      setItems(prev => prev.map(r => r.id === id ? { ...r, done: target.done } : r))
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async (id: string) => {
    const snapshot = items
    setItems(prev => prev.filter(r => r.id !== id))
    try {
      await deleteReminderApi(id)
    } catch (err) {
      setItems(snapshot)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const updateItem = async (id: string, newText: string) => {
    const trimmed = newText.trim()
    if (!trimmed) return
    const rec = parseRecurrence(trimmed)
    const due = rec ? null : parseDueDate(trimmed)
    const baseText = rec ? rec.cleaned : (due ? due.cleaned : trimmed)
    const text = baseText || trimmed
    const snapshot = items
    setItems(prev => prev.map(r => r.id === id ? {
      ...r,
      text,
      dueDate: rec ? undefined : due?.dueDate,
      recurrence: rec?.recurrence,
    } : r))
    try {
      await updateReminderApi(id, {
        text,
        dueDate: rec ? null : (due?.dueDate ?? null),
        recurrence: rec?.recurrence ?? null,
      })
    } catch (err) {
      setItems(snapshot)
      setError(err instanceof Error ? err.message : String(err))
    }
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

      {error && (
        <div style={{ fontSize: 11.5, color: 'var(--red)', marginBottom: 10, padding: '6px 8px', background: 'rgba(239,68,68,0.05)', borderRadius: 6 }}>
          {error}
        </div>
      )}

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
            placeholder="Add a reminder… try “call Friday” or “every day”"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>
        {recurrenceParsed && (
          <div style={{ marginLeft: 32, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 10.5, padding: '2px 7px', borderRadius: 4, fontWeight: 500,
              background: 'rgba(167,139,250,0.12)', color: 'var(--violet)',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                <path d="M3 12a9 9 0 0 1 15-6.7l3 2.7M21 3v6h-6"/><path d="M21 12a9 9 0 0 1-15 6.7l-3-2.7M3 21v-6h6"/>
              </svg>
              {recurrenceLabel(recurrenceParsed.recurrence)} · until done
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>from “{recurrenceParsed.matchedText}”</span>
          </div>
        )}
        {!recurrenceParsed && dueParsed && (
          <div style={{ marginLeft: 32, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 10.5, padding: '2px 7px', borderRadius: 4, fontWeight: 500,
              background: 'rgba(96,165,250,0.10)', color: 'var(--blue)',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>
              </svg>
              Due {formatDueLabel(dueParsed.dueDate)}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>from “{dueParsed.matchedText}”</span>
          </div>
        )}
      </div>

      {!hydrated ? (
        <div style={{ fontSize: 12, color: 'var(--text-4)', padding: '4px 0', fontStyle: 'italic' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-4)', padding: '4px 0', fontStyle: 'italic' }}>
          Nothing on your list. Type above and hit Enter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {open.map(r => (
            <Item key={r.id} item={r} onToggle={() => toggle(r.id)} onRemove={() => remove(r.id)} onSave={(text) => updateItem(r.id, text)} />
          ))}
          {done.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-4)', fontWeight: 500, marginTop: 12, marginBottom: 4 }}>Done</div>
              {done.map(r => (
                <Item key={r.id} item={r} onToggle={() => toggle(r.id)} onRemove={() => remove(r.id)} onSave={(text) => updateItem(r.id, text)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Item({ item, onToggle, onRemove, onSave }: { item: Reminder; onToggle: () => void; onRemove: () => void; onSave: (text: string) => void }) {
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const reconstruct = (r: Reminder): string => {
    if (r.recurrence) return `${r.text} ${recurrenceLabel(r.recurrence).toLowerCase()}`.trim()
    return r.text
  }
  const [draft, setDraft] = useState(() => reconstruct(item))
  const overdue = !item.done && isOverdue(item.dueDate)
  const dueLabel = item.dueDate ? formatDueLabel(item.dueDate) : null
  const recurLabel = item.recurrence ? recurrenceLabel(item.recurrence) : null

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraft(reconstruct(item))
    } else {
      onSave(trimmed)
    }
    setEditing(false)
  }

  const cancel = () => {
    setDraft(reconstruct(item))
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px' }}>
        <div style={{ width: 16, flexShrink: 0 }} />
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            else if (e.key === 'Escape') { e.preventDefault(); cancel() }
          }}
          onBlur={commit}
          style={{
            flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
            color: 'var(--text)', padding: '6px 8px', borderRadius: 5,
            fontSize: 13, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace' }}>Enter to save · Esc to cancel</span>
      </div>
    )
  }

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
      <div
        style={{ flex: 1, minWidth: 0, cursor: 'text' }}
        onClick={() => !item.done && setEditing(true)}
        title={item.done ? '' : 'Click to edit'}
      >
        <div style={{
          fontSize: 13, lineHeight: 1.4,
          color: item.done ? 'var(--text-4)' : 'var(--text)',
          textDecoration: item.done ? 'line-through' : 'none',
          wordBreak: 'break-word',
        }}>{item.text}</div>
        {!item.done && (recurLabel || dueLabel) && (
          <div style={{ marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {recurLabel && (
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--violet)' }}>{recurLabel}</span>
            )}
            {dueLabel && (
              <span style={{
                fontSize: 10.5, fontWeight: 500,
                color: overdue ? 'var(--red)' : dueLabel === 'Today' ? 'var(--amber)' : 'var(--text-3)',
              }}>{dueLabel}</span>
            )}
          </div>
        )}
      </div>
      {hover && !item.done && (
        <>
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit reminder"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-4)', padding: 4, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
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
        </>
      )}
      {hover && item.done && (
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
