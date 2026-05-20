'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  gradeBg,
  gradeColors,
  parseSegment,
  segmentLabel,
  type SegmentFilter,
} from '@/lib/candidates'

type ApiCandidate = {
  id: string
  name: string
  region: string
  current_stage: string
  current_group_title: string | null
  tier: string | null
  assigned_manager: string | null
}

function filterToQuery(filter: SegmentFilter): string {
  const region = filter.region
  if (filter.kind === 'all') return `region=${region}`
  if (filter.kind === 'grade') return `region=${region}&grade=${filter.grade}`
  // stage → bucket name (segment URLs use UI bucket names already)
  return `region=${region}&bucket=${filter.stage}`
}

export default function SegmentModal() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const filter = parseSegment(params.get('segment'))
  const candidateOpen = !!params.get('candidate')

  const [candidates, setCandidates] = useState<ApiCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filterKey = filter ? JSON.stringify(filter) : null

  useEffect(() => {
    if (!filter || candidateOpen) { setCandidates(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/candidates?${filterToQuery(filter)}&limit=200`)
      .then(async r => {
        if (!r.ok) throw new Error(`Lookup failed (${r.status})`)
        return r.json()
      })
      .then(d => { if (!cancelled) setCandidates(d.candidates ?? []) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, candidateOpen])

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
              {sub}{candidates !== null ? ` · ${candidates.length} ${candidates.length === 1 ? 'candidate' : 'candidates'}` : ''}
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

        <div style={{ padding: '12px 12px 16px' }}>
          {loading && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
              Loading…
            </div>
          )}
          {error && !loading && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--red)', fontSize: 12 }}>
              {error}
            </div>
          )}
          {!loading && !error && candidates !== null && candidates.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No candidates in this segment.
            </div>
          )}
          {!loading && candidates && candidates.map(c => (
            <Row key={c.id} candidate={c} onOpen={() => openCandidate(c.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ candidate, onOpen }: { candidate: ApiCandidate; onOpen: () => void }) {
  const grade = candidate.tier && /^[A-F]$/i.test(candidate.tier) ? candidate.tier.toUpperCase() : null
  const stage = candidate.current_group_title ?? candidate.current_stage.replace(/_/g, ' ')
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
        background: grade ? gradeBg[grade] : 'var(--surface-3)',
        color: grade ? gradeColors[grade] : 'var(--text-4)',
      }}>{grade || '—'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{candidate.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
          {stage}{candidate.assigned_manager ? ` · ${candidate.assigned_manager}` : ''}
        </div>
      </div>
    </div>
  )
}
