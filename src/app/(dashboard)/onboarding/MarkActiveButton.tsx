'use client'

import { useState, useTransition } from 'react'
import { markModelActive } from './actions'

export default function MarkActiveButton({ modelId, modelName }: { modelId: string; modelName: string }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const onClick = () => {
    if (pending) return
    if (!window.confirm(`Mark ${modelName} as ACTIVE on Monday? This pushes the status change live.`)) return
    setResult(null)
    startTransition(async () => {
      const r = await markModelActive(modelId)
      if (r.ok) setResult({ ok: true, msg: 'Marked active. Refresh.' })
      else setResult({ ok: false, msg: r.error })
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={onClick}
        disabled={pending}
        title={`Push status=ACTIVE to Monday for ${modelName}`}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--text-2)',
          padding: '4px 10px',
          borderRadius: 5,
          fontSize: 10.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontFamily: 'inherit',
          cursor: pending ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? 'Activating…' : 'Mark active'}
      </button>
      {result && (
        <div style={{
          fontSize: 10,
          color: result.ok ? 'var(--green)' : 'var(--red)',
          fontFamily: 'monospace',
          textAlign: 'right',
          maxWidth: 200,
        }}>{result.msg}</div>
      )}
    </div>
  )
}
