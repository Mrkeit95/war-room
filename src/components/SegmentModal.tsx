'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  filterCandidates,
  gradeBg,
  gradeColors,
  parseSegment,
  segmentLabel,
  trajectoryColor,
  trajectoryIcon,
  type Candidate,
} from '@/lib/candidates'

export default function SegmentModal() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const filter = parseSegment(params.get('segment'))
  const candidateOpen = !!params.get('candidate')

  const close = () => router.push(pathname, { scroll: false })

  useEffect(() => {
    if (!filter || candidateOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, candidateOpen])

  if (!filter || candidateOpen) return null

  const candidates = filterCandidates(filter)
  const { title, sub } = segmentLabel(filter)
  const openCandidate = (id: string) => router.push(`${pathname}?candidate=${id}`, { scroll: false })

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-strong)',
        borderRadius: 16, width: '100%', maxWidth: 560,
        maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {sub} · {candidates.length} {candidates.length === 1 ? 'candidate' : 'candidates'}
            </div>
          </div>
          <button
            onClick={close}
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

        <div style={{ padding: candidates.length ? '8px 12px 16px' : '32px 24px' }}>
          {candidates.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No candidate detail synced yet for this segment.
              <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 6 }}>
                Hooks up once Monday.com sync is wired.
              </div>
            </div>
          ) : (
            candidates.map(c => (
              <Row key={c.id} candidate={c} onOpen={() => openCandidate(c.id)} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ candidate, onOpen }: { candidate: Candidate; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px', borderRadius: 8, cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 11.5, fontFamily: 'monospace', flexShrink: 0,
        background: candidate.grade ? gradeBg[candidate.grade] : 'var(--surface-3)',
        color: candidate.grade ? gradeColors[candidate.grade] : 'var(--text-4)',
      }}>{candidate.grade || '—'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          {candidate.name}
          {candidate.trajectory && (
            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: trajectoryColor(candidate.trajectory) }}>
              {trajectoryIcon(candidate.trajectory)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
          {candidate.stage} · {candidate.manager}
        </div>
      </div>
      {candidate.days > 0 && (
        <span style={{
          fontFamily: 'monospace', fontSize: 11, flexShrink: 0,
          color: candidate.days >= 5 ? 'var(--red)' : candidate.days >= 3 ? 'var(--amber)' : 'var(--green)',
        }}>{candidate.days}d</span>
      )}
    </div>
  )
}
