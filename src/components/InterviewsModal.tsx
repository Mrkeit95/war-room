'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  CANDIDATES,
  gradeBg,
  gradeColors,
  trajectoryColor,
  trajectoryIcon,
  type Candidate,
  type Region,
} from '@/lib/candidates'
import { getRegionPhase, phaseBg, phaseColor, phaseLabel, type RegionPhase } from '@/lib/rotation'

const REGIONS: { code: Region; flag: string; name: string }[] = [
  { code: 'PH', flag: '🇵🇭', name: 'Philippines' },
  { code: 'EU', flag: '🇪🇺', name: 'Europe' },
  { code: 'SA', flag: '🇧🇷', name: 'South America' },
  { code: 'UK', flag: '🇬🇧', name: 'United Kingdom' },
]

export default function InterviewsModal() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const isOpen = params.get('interviews') === '1'
  const candidateOpen = !!params.get('candidate')

  const close = () => {
    const next = new URLSearchParams(params.toString())
    next.delete('interviews')
    const query = next.toString()
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  useEffect(() => {
    if (!isOpen || candidateOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, candidateOpen])

  if (!isOpen || candidateOpen) return null

  const openCandidate = (id: string) => router.push(`${pathname}?candidate=${id}`, { scroll: false })

  const byRegion = REGIONS.map(r => ({
    ...r,
    phase: getRegionPhase(r.code),
    pending: Object.values(CANDIDATES).filter(c => c.region === r.code && c.stageKey === 'pending'),
    scheduled: Object.values(CANDIDATES).filter(c => c.region === r.code && c.stageKey === 'scheduled'),
  }))

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
        borderRadius: 16, width: '100%', maxWidth: 720,
        maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>Interviews by sector</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Pending + scheduled interviews · rotation phase shown per region
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

        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {byRegion.map(r => (
            <RegionBlock
              key={r.code}
              flag={r.flag}
              name={r.name}
              phase={r.phase}
              pending={r.pending}
              scheduled={r.scheduled}
              onOpenCandidate={openCandidate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function RegionBlock({
  flag, name, phase, pending, scheduled, onOpenCandidate,
}: {
  flag: string; name: string; phase: RegionPhase;
  pending: Candidate[]; scheduled: Candidate[];
  onOpenCandidate: (id: string) => void;
}) {
  const total = pending.length + scheduled.length
  const isEmpty = total === 0

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isEmpty ? 0 : 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{flag} {name}</div>
          {phase && (
            <span style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600,
              padding: '2px 7px', borderRadius: 4,
              background: phaseBg(phase), color: phaseColor(phase),
            }}>{phaseLabel(phase)}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
          {isEmpty ? '—' : `${pending.length} pending · ${scheduled.length} scheduled`}
        </div>
      </div>

      {!isEmpty && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Subgroup label="Pending interview" candidates={pending} onOpen={onOpenCandidate} />
          <Subgroup label="Scheduled interview" candidates={scheduled} onOpen={onOpenCandidate} />
        </div>
      )}
    </div>
  )
}

function Subgroup({ label, candidates, onOpen }: { label: string; candidates: Candidate[]; onOpen: (id: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)', fontWeight: 500, marginBottom: 8 }}>{label}</div>
      {candidates.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic' }}>None</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {candidates.map(c => (
            <CandidateRow key={c.id} candidate={c} onClick={() => onOpen(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function CandidateRow({ candidate, onClick }: { candidate: Candidate; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 6,
        background: 'var(--surface)', cursor: 'pointer',
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 10, fontFamily: 'monospace', flexShrink: 0,
        background: candidate.grade ? gradeBg[candidate.grade] : 'var(--surface-3)',
        color: candidate.grade ? gradeColors[candidate.grade] : 'var(--text-4)',
      }}>{candidate.grade || '—'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.name}</span>
          {candidate.trajectory && (
            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: trajectoryColor(candidate.trajectory), fontSize: 11 }}>
              {trajectoryIcon(candidate.trajectory)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>{candidate.stage}</div>
      </div>
      {candidate.days > 0 && (
        <span style={{
          fontFamily: 'monospace', fontSize: 10, flexShrink: 0,
          color: candidate.days >= 5 ? 'var(--red)' : candidate.days >= 3 ? 'var(--amber)' : 'var(--green)',
        }}>{candidate.days}d</span>
      )}
    </div>
  )
}
