'use client'

import { useState, useTransition } from 'react'
import { undoMonthlySubitemSeed, type UndoSeedResult } from './actions'

export default function UndoSeedButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<UndoSeedResult | null>(null)

  const onClick = () => {
    if (pending) return
    if (!window.confirm('DELETE every subitem named after the current month on every ACTIVE chatter on Monday? This cannot be undone — but you can re-seed afterwards.')) return
    setResult(null)
    startTransition(async () => {
      setResult(await undoMonthlySubitemSeed())
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button
        onClick={onClick}
        disabled={pending}
        style={{
          background: 'transparent',
          border: '1px solid rgba(239,68,68,0.4)',
          color: 'var(--red)',
          padding: '6px 12px', borderRadius: 6,
          fontSize: 12.5, fontFamily: 'inherit',
          cursor: pending ? 'wait' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? 'Deleting…' : 'Undo monthly seed'}
      </button>
      {result && (
        <div style={{ fontSize: 11, fontFamily: 'monospace', maxWidth: 360, textAlign: 'right' }}>
          {result.ok ? (
            <div style={{ color: 'var(--green)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div>✓ &quot;{result.subitemName}&quot; deleted</div>
              <div style={{ color: 'var(--text-3)' }}>
                {result.deleted} subitems removed · {result.chattersTouched} chatters touched
                {result.failed > 0 && <span style={{ color: 'var(--red)' }}> · {result.failed} failed</span>}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--red)' }}>✗ {result.error}</div>
          )}
        </div>
      )}
    </div>
  )
}
