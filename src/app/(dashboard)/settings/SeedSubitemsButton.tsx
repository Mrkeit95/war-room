'use client'

import { useState, useTransition } from 'react'
import { bulkSeedMonthlyGradeSubitems, type BulkSeedResult } from './actions'

export default function SeedSubitemsButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<BulkSeedResult | null>(null)

  const onClick = () => {
    if (pending) return
    if (!window.confirm('Create a grading subitem on every ACTIVE chatter for this month? This writes to Monday — idempotent, safe to re-run.')) return
    setResult(null)
    startTransition(async () => {
      setResult(await bulkSeedMonthlyGradeSubitems())
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
          padding: '6px 12px', borderRadius: 6,
          fontSize: 12.5, fontFamily: 'inherit',
          cursor: pending ? 'wait' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? 'Seeding…' : 'Seed monthly subitems'}
      </button>
      {result && (
        <div style={{ fontSize: 11, fontFamily: 'monospace', maxWidth: 360, textAlign: 'right' }}>
          {result.ok ? (
            <div style={{ color: 'var(--green)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div>✓ &quot;{result.subitemName}&quot;</div>
              <div style={{ color: 'var(--text-3)' }}>
                {result.created} created · {result.alreadySeeded} skipped (already seeded){result.failed > 0 ? ` · ${result.failed} failed` : ''}
              </div>
              {result.failed > 0 && (
                <div style={{ color: 'var(--red)' }}>
                  Failures: {result.failedSamples.join(', ')}{result.failed > result.failedSamples.length ? `, +${result.failed - result.failedSamples.length} more` : ''}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--red)' }}>✗ {result.error}</div>
          )}
        </div>
      )}
    </div>
  )
}
