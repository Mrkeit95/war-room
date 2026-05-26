'use client'

import { useEffect, useState } from 'react'
import type { ModelWithCapacity } from '@/lib/models'

type Shift = {
  shiftName: string
  chatterName: string             // empty string when slot is unfilled
  groupTitle: string | null
  pod: string | null
  team: string | null
}

export default function AssignmentLink({ model, stillColor }: { model: ModelWithCapacity; stillColor: string }) {
  const [open, setOpen] = useState(false)
  const clickable = model.chattersAlreadyAssigned > 0

  return (
    <>
      <button
        onClick={clickable ? () => setOpen(true) : undefined}
        disabled={!clickable}
        style={{
          background: 'transparent', border: 'none',
          padding: 0, fontFamily: 'inherit',
          cursor: clickable ? 'pointer' : 'default',
          textAlign: 'right', width: '100%',
        }}
        title={clickable ? 'View chatters already on this page' : undefined}
      >
        <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: stillColor, lineHeight: 1 }}>
          {model.chattersStillNeeded}
        </div>
        <div style={{
          fontFamily: 'monospace', fontSize: 10.5,
          color: clickable ? 'var(--text-3)' : 'var(--text-4)', marginTop: 4,
          textDecoration: clickable ? 'underline' : 'none',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: 2,
        }}>
          {model.chattersAlreadyAssigned} / {model.chattersNeeded} assigned
        </div>
      </button>
      {open && <BreakdownModal model={model} onClose={() => setOpen(false)} />}
    </>
  )
}

function BreakdownModal({ model, onClose }: { model: ModelWithCapacity; onClose: () => void }) {
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/onboarding/assignments?model=${encodeURIComponent(model.name)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => { if (!cancelled) setShifts(d.shifts) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [model.name])

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
        borderRadius: 16, width: '100%', maxWidth: 520,
        maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{model.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4, fontFamily: 'monospace' }}>
              {[
                model.pod && model.team ? `POD ${model.pod} · ${model.team}` : null,
                model.board,
              ].filter(Boolean).join(' · ') || 'Not scheduled'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer',
              width: 30, height: 30, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-2)', fontFamily: 'inherit',
            }}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 12px 16px' }}>
          {!shifts && !error && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--red)', fontSize: 12 }}>{error}</div>
          )}
          {shifts && shifts.length === 0 && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No shift rows found on the chatter schedule board for this page.
            </div>
          )}
          {shifts && shifts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {shifts.map((s, i) => (
                <div key={`${s.shiftName}-${i}`} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0, 140px) minmax(0, 1fr)',
                  gap: 14, alignItems: 'center',
                  padding: '12px 12px',
                  borderBottom: i === shifts.length - 1 ? 'none' : '1px solid var(--border)',
                }}>
                  <div style={{
                    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em',
                    color: 'var(--text-3)', fontWeight: 600, fontFamily: 'monospace',
                  }}>{s.shiftName}</div>
                  {s.chatterName ? (
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{s.chatterName}</div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic' }}>unassigned</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Summary footer */}
          {shifts && shifts.length > 0 && (
            <div style={{
              marginTop: 8, padding: '12px 12px',
              borderTop: '1px solid var(--border)',
              fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'monospace',
              display: 'flex', justifyContent: 'space-between', gap: 14,
            }}>
              <span>{model.chattersAlreadyAssigned} / {model.chattersNeeded} chatters in place</span>
              <span style={{ color: model.chattersStillNeeded === 0 ? 'var(--green)' : 'var(--blue)' }}>
                {model.chattersStillNeeded === 0 ? 'fully staffed' : `need ${model.chattersStillNeeded} more`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
