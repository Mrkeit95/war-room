'use client'

import { useState, useTransition } from 'react'
import { replicateGradingColumns, type ReplicateResult } from './actions'

export default function ReplicateGradingButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ReplicateResult | null>(null)

  const onClick = () => {
    if (pending) return
    if (!window.confirm('Replicate the PH grading columns to EU, SA, and UK boards? This adds new columns on those boards — idempotent (skips columns that already exist).')) return
    setResult(null)
    startTransition(async () => {
      const r = await replicateGradingColumns()
      setResult(r)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button
        onClick={onClick}
        disabled={pending}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          padding: '6px 12px',
          borderRadius: 6,
          fontSize: 12.5,
          fontFamily: 'inherit',
          cursor: pending ? 'wait' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? 'Replicating…' : 'Replicate now'}
      </button>
      {result && (
        <div style={{ fontSize: 11, fontFamily: 'monospace', maxWidth: 360, color: result.ok ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>
          {result.ok ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {result.perBoard.map(b => (
                <div key={b.board}>
                  <strong>{b.board}:</strong> {b.created.length} created · {b.skipped.length} skipped
                </div>
              ))}
            </div>
          ) : `✗ ${result.error}`}
        </div>
      )}
    </div>
  )
}
