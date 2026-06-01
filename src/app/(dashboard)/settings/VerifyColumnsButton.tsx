'use client'

import { useState, useTransition } from 'react'
import { verifyGradingColumns, type VerifyResult, type ColumnDiff, type BoardDiff } from './actions'

export default function VerifyColumnsButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<VerifyResult | null>(null)

  const onClick = () => {
    if (pending) return
    setResult(null)
    startTransition(async () => {
      setResult(await verifyGradingColumns())
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
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
        {pending ? 'Verifying…' : 'Verify column parity'}
      </button>
      {result && !result.ok && (
        <div style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'monospace' }}>✗ {result.error}</div>
      )}
      {result && result.ok && (
        <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.perBoard.map(b => <BoardCard key={b.board} diff={b} />)}
        </div>
      )}
    </div>
  )
}

function BoardCard({ diff }: { diff: BoardDiff }) {
  const allDiffs = [...diff.parent, ...diff.subitem]
  const problems = allDiffs.filter(d => d.status !== 'ok')
  const ok = problems.length === 0

  return (
    <div style={{
      background: 'var(--surface-2)',
      border: `1px solid ${ok ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 8,
      padding: '10px 12px',
      fontSize: 11.5,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ color: 'var(--text)' }}>{diff.board}</strong>
        <span style={{ color: ok ? 'var(--green)' : 'var(--red)', fontFamily: 'monospace' }}>
          {ok ? '✓ all match' : `${problems.length} issue${problems.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {!ok && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3, fontFamily: 'monospace', fontSize: 11 }}>
          {problems.map((d, i) => <li key={i}>{describe(d, diff.parent.includes(d) ? 'parent' : 'subitem')}</li>)}
        </ul>
      )}
    </div>
  )
}

function describe(d: ColumnDiff, layer: 'parent' | 'subitem'): string {
  if (d.status === 'missing') return `[${layer}] ${d.title} — missing`
  if (d.status === 'type-mismatch') return `[${layer}] ${d.title} — type ${d.targetType} (PH has ${d.sourceType})`
  if (d.status === 'options-mismatch') {
    const parts: string[] = []
    if (d.missingOptions.length > 0) parts.push(`missing options: ${d.missingOptions.join(', ')}`)
    if (d.extraOptions.length > 0) parts.push(`extra options: ${d.extraOptions.join(', ')}`)
    return `[${layer}] ${d.title} — ${parts.join(' · ')}`
  }
  return ''
}
