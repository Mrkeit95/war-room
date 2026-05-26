'use client'

import { useEffect, useState } from 'react'
import type { PodEntry, TeamEntry, ChatterEntry, ShiftSlot } from '@/lib/boards'

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

export default function PodPanel({ pod }: { pod: PodEntry }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          textAlign: 'left',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '18px 22px',
          cursor: 'pointer',
          fontFamily: 'inherit', color: 'inherit',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>POD {pod.pod}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              Manager: {pod.manager ? <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{pod.manager}</span> : <span style={{ color: 'var(--text-4)', fontStyle: 'italic' }}>not set</span>}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', textAlign: 'right' }}>
            {pod.teams.length} team{pod.teams.length === 1 ? '' : 's'} · {pod.chatterCount} chatter{pod.chatterCount === 1 ? '' : 's'}<br />
            click for shifts
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {pod.teams.map(t => (
            <span key={t.team} style={{
              fontSize: 11.5, padding: '3px 9px', borderRadius: 4,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text-2)',
              display: 'inline-flex', alignItems: 'baseline', gap: 6,
            }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>{t.team}</span>
              <span style={{ color: 'var(--text)' }}>{t.pageNames.join(' · ') || '—'}</span>
            </span>
          ))}
        </div>
      </button>
      {open && <PodModal pod={pod} onClose={() => setOpen(false)} />}
    </>
  )
}

function PodModal({ pod, onClose }: { pod: PodEntry; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-strong)',
        borderRadius: 16, width: '100%', maxWidth: 980,
        maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14,
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>POD {pod.pod}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4, fontFamily: 'monospace' }}>
              {pod.teams.length} team{pod.teams.length === 1 ? '' : 's'} · {pod.chatterCount} chatter{pod.chatterCount === 1 ? '' : 's'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer',
            width: 30, height: 30, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-2)', fontFamily: 'inherit',
          }} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: '18px 24px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {pod.teams.map(team => (
            <TeamBlock key={team.team} team={team} />
          ))}
        </div>
      </div>
    </div>
  )
}

function TeamBlock({ team }: { team: TeamEntry }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <span style={{
          fontSize: 11, padding: '3px 9px', borderRadius: 4,
          background: 'var(--surface-3)', color: 'var(--text-2)',
          fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.06em',
        }}>{team.team}</span>
        <div style={{ fontSize: 14, fontWeight: 500 }}>
          {team.pageNames.join(' · ') || <span style={{ color: 'var(--text-4)', fontStyle: 'italic' }}>no pages</span>}
        </div>
      </div>
      {team.chatters.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic', paddingLeft: 8 }}>
          No chatters assigned yet
        </div>
      ) : (
        <ScheduleTable chatters={team.chatters} />
      )}
    </div>
  )
}

function ScheduleTable({ chatters }: { chatters: ChatterEntry[] }) {
  // Flatten chatters × shift slots — one row per (chatter, slot)
  type Row = { chatter: string; manager: string | null; slot: ShiftSlot }
  const rows: Row[] = []
  for (const c of chatters) {
    if (c.slots.length === 0) {
      for (const shiftName of c.shifts) {
        rows.push({ chatter: c.name, manager: c.manager, slot: { shiftName, scheduleByDay: {} } })
      }
    } else {
      for (const s of c.slots) rows.push({ chatter: c.name, manager: c.manager, slot: s })
    }
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.4fr) minmax(120px, 1fr) minmax(100px, 0.8fr) repeat(7, minmax(80px, 1fr))', minWidth: 960 }}>
        {/* Header */}
        <Cell header>Chatter</Cell>
        <Cell header>Manager</Cell>
        <Cell header>Shift</Cell>
        {DAY_ORDER.map(d => <Cell key={d} header>{d.slice(0, 3)}</Cell>)}

        {/* Rows */}
        {rows.map((r, i) => (
          <RowFragment key={`${r.chatter}-${r.slot.shiftName}-${i}`} chatter={r.chatter} manager={r.manager} slot={r.slot} />
        ))}
      </div>
    </div>
  )
}

function RowFragment({ chatter, manager, slot }: { chatter: string; manager: string | null; slot: ShiftSlot }) {
  return (
    <>
      <Cell>{chatter}</Cell>
      <Cell dim={!manager}>{manager ?? '—'}</Cell>
      <Cell mono dim>{slot.shiftName}</Cell>
      {DAY_ORDER.map(day => {
        const v = slot.scheduleByDay?.[day]
        const isOff = !v || v.trim().toUpperCase() === 'OFF' || v.trim() === ''
        return <Cell key={day} mono dim={isOff}>{isOff ? 'OFF' : v}</Cell>
      })}
    </>
  )
}

function Cell({ children, header, mono, dim }: { children?: React.ReactNode; header?: boolean; mono?: boolean; dim?: boolean }) {
  return (
    <div style={{
      padding: '8px 10px',
      borderBottom: '1px solid var(--border)',
      borderRight: '1px solid var(--border)',
      fontSize: header ? 10 : 11.5,
      textTransform: header ? 'uppercase' : 'none',
      letterSpacing: header ? '0.12em' : 'normal',
      color: header ? 'var(--text-4)' : dim ? 'var(--text-4)' : 'var(--text)',
      fontWeight: header ? 600 : 500,
      fontFamily: mono ? 'monospace' : 'inherit',
      background: header ? 'var(--surface-2)' : 'transparent',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>{children}</div>
  )
}
