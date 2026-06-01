'use client'

import { useState, useTransition } from 'react'
import { triggerSync } from '@/app/(dashboard)/onboarding/actions'

type LastResult =
  | {
      ok: true
      modelsSynced: number
      candidatesSynced: number
      pageAssignmentsSynced: number
      boardGroupsSynced: number
      chatterGradesSynced: number
      gradesWrittenBack: number
      durationMs: number
      warnings: string[]
    }
  | { ok: false; error: string }
  | null

export default function TopbarSyncButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<LastResult>(null)
  const [showPopover, setShowPopover] = useState(false)

  const onClick = () => {
    if (pending) return
    setResult(null)
    startTransition(async () => {
      const r = await triggerSync()
      if (r.ok) {
        setResult({
          ok: true,
          modelsSynced: r.modelsSynced,
          candidatesSynced: r.candidatesSynced,
          pageAssignmentsSynced: r.pageAssignmentsSynced,
          boardGroupsSynced: r.boardGroupsSynced,
          chatterGradesSynced: r.chatterGradesSynced,
          gradesWrittenBack: r.gradesWrittenBack,
          durationMs: r.durationMs,
          warnings: r.warnings,
        })
      } else {
        setResult({ ok: false, error: r.error })
      }
      setShowPopover(true)
      // Stay open for 15s on success (so warnings can be read); stays open on failure
      if (r.ok && r.warnings.length === 0) setTimeout(() => setShowPopover(false), 15000)
    })
  }

  const dotColor = pending ? 'var(--amber)' : result && !result.ok ? 'var(--red)' : 'var(--green)'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        title={pending ? 'Syncing…' : 'Sync everything (Monday + revenue tracker)'}
        style={{
          width: 34, height: 34, borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-2)', cursor: pending ? 'wait' : 'pointer',
          position: 'relative', padding: 0,
          fontFamily: 'inherit',
        }}
        aria-label="Sync"
      >
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{
            width: 16, height: 16,
            animation: pending ? 'tb-spin 0.9s linear infinite' : undefined,
          }}
        >
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
          <path d="M16 16h5v5"/>
        </svg>
        <div style={{
          position: 'absolute', top: 6, right: 6,
          width: 7, height: 7, borderRadius: '50%',
          background: dotColor, border: '2px solid var(--canvas)',
        }} />
      </button>
      <style jsx>{`@keyframes tb-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {showPopover && result && (
        <div
          onMouseLeave={() => result.ok && setShowPopover(false)}
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            background: 'var(--surface)', border: '1px solid var(--border-strong)',
            borderRadius: 8, padding: '10px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            minWidth: 240, maxWidth: 340, zIndex: 30,
            fontSize: 11.5, lineHeight: 1.5,
          }}
        >
          {result.ok ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Sync complete</span>
                <span style={{ color: 'var(--text-4)', fontFamily: 'monospace' }}>{(result.durationMs / 1000).toFixed(1)}s</span>
              </div>
              <div style={{ color: 'var(--text-3)', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div>{result.candidatesSynced} chatters · {result.modelsSynced} models</div>
                <div>{result.pageAssignmentsSynced} shifts · {result.boardGroupsSynced} pod mappings</div>
                <div style={{ color: result.chatterGradesSynced > 0 ? 'var(--text-2)' : 'var(--text-4)' }}>
                  {result.chatterGradesSynced} grades pulled · {result.gradesWrittenBack} written back to Monday
                </div>
              </div>
              {result.warnings.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', color: 'var(--amber)', fontFamily: 'monospace', fontSize: 11, maxHeight: 180, overflowY: 'auto' }}>
                  {result.warnings.slice(0, 6).map((w, i) => <div key={i} style={{ marginBottom: 4, wordBreak: 'break-word' }}>⚠ {w}</div>)}
                  {result.warnings.length > 6 && <div style={{ color: 'var(--text-4)' }}>+{result.warnings.length - 6} more</div>}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 4 }}>
                ✗ Sync failed
              </div>
              <div style={{ color: 'var(--text-3)', fontFamily: 'monospace', wordBreak: 'break-word' }}>{result.error}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
