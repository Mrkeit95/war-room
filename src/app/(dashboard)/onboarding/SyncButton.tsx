'use client'

import { useState, useTransition } from 'react'
import { triggerSync, type SyncActionResult } from './actions'

export default function SyncButton({ subtle }: { subtle?: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<SyncActionResult | null>(null)

  const onClick = () => {
    setResult(null)
    startTransition(async () => {
      const r = await triggerSync()
      setResult(r)
    })
  }

  const label = isPending ? 'Syncing…' : result?.ok === false ? 'Retry sync' : 'Sync now'

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={onClick}
        disabled={isPending}
        style={{
          background: subtle ? 'transparent' : 'var(--text)',
          color: subtle ? 'var(--text-2)' : 'var(--bg)',
          border: subtle ? '1px solid var(--border)' : 'none',
          padding: subtle ? '5px 10px' : '8px 14px',
          borderRadius: 6,
          fontSize: subtle ? 11 : 12.5,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: isPending ? 'wait' : 'pointer',
          opacity: isPending ? 0.6 : 1,
          alignSelf: 'flex-start',
        }}
      >{label}</button>
      {result && (
        <div style={{
          fontSize: 11.5,
          color: result.ok ? 'var(--green)' : 'var(--red)',
          lineHeight: 1.4,
          maxWidth: 360,
        }}>
          {result.ok ? (
            <>
              ✓ Synced {result.modelsSynced} models · {result.candidatesSynced} chatters · {result.pageAssignmentsSynced} shifts · {result.boardGroupsSynced} board-group mappings · {(result.durationMs / 1000).toFixed(1)}s. Refresh to see updates.
              {result.warnings.length > 0 && (
                <div style={{ marginTop: 6, color: 'var(--amber)', fontSize: 11, fontFamily: 'monospace' }}>
                  {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}
            </>
          ) : `✗ ${result.error}`}
        </div>
      )}
    </div>
  )
}
