'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getCandidate, gradeBg, gradeColors, trajectoryColor, trajectoryIcon, type Candidate } from '@/lib/candidates'

const NOTES_KEY = 'war-room.candidate-notes'

function loadNotes(): Record<string, { date: string; text: string }[]> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(window.sessionStorage.getItem(NOTES_KEY) || '{}') } catch { return {} }
}
function saveNotesStore(store: Record<string, { date: string; text: string }[]>) {
  try { window.sessionStorage.setItem(NOTES_KEY, JSON.stringify(store)) } catch {}
}

export default function CandidateModal() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const id = params.get('candidate')
  const candidate = getCandidate(id)

  const [draft, setDraft] = useState('')
  const [notesStore, setNotesStore] = useState<Record<string, { date: string; text: string }[]>>({})

  useEffect(() => { setNotesStore(loadNotes()) }, [id])

  const close = () => {
    router.push(pathname, { scroll: false })
  }

  useEffect(() => {
    if (!candidate) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate])

  if (!candidate) return null

  const sessionNotes = notesStore[candidate.id] || []
  const allNotes = [...candidate.notes, ...sessionNotes]

  const saveNote = () => {
    const text = draft.trim()
    if (!text) return
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const next = { ...notesStore, [candidate.id]: [...sessionNotes, { date: `${dateStr} (just now)`, text }] }
    setNotesStore(next)
    saveNotesStore(next)
    setDraft('')
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-strong)',
        borderRadius: 16, width: '100%', maxWidth: 640,
        maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{candidate.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {candidate.region} · {candidate.stage} · {candidate.manager}
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

        <div style={{ padding: '20px 24px 24px' }}>
          <CandidateHeader candidate={candidate} />

          <Section title="Journey">
            {candidate.timeline.length === 0 ? (
              <Empty>No timeline yet</Empty>
            ) : (
              <Timeline candidate={candidate} />
            )}
          </Section>

          <Section title="Your private notes">
            {allNotes.length === 0 ? (
              <Empty>No notes yet</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {allNotes.map((n, i) => (
                  <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'monospace' }}>{n.date}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>{n.text}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote() } }}
                rows={2}
                placeholder={`Add a note about ${candidate.name}…`}
                style={{
                  flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text)', padding: '8px 10px', borderRadius: 6,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
                }}
              />
              <button
                onClick={saveNote}
                style={{
                  background: draft.trim() ? 'var(--text)' : 'var(--surface-3)',
                  color: draft.trim() ? 'var(--bg)' : 'var(--text-3)',
                  border: 'none', borderRadius: 6, padding: '0 14px',
                  fontSize: 12.5, fontWeight: 500, cursor: draft.trim() ? 'pointer' : 'default',
                  fontFamily: 'inherit', alignSelf: 'stretch',
                }}
              >
                Save
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function CandidateHeader({ candidate }: { candidate: Candidate }) {
  const traj = candidate.trajectory
  const allTags = [
    ...candidate.tags.strengths.map(t => ({ text: t, tone: 'good' as const })),
    ...candidate.tags.flags.map(t => ({ text: t, tone: 'bad' as const })),
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 18, fontFamily: 'monospace',
        background: candidate.grade ? gradeBg[candidate.grade] : 'var(--surface-3)',
        color: candidate.grade ? gradeColors[candidate.grade] : 'var(--text-4)',
      }}>{candidate.grade || '—'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          {candidate.name}
          {traj && (
            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: trajectoryColor(traj) }}>
              {trajectoryIcon(traj)}
            </span>
          )}
        </div>
        {allTags.length > 0 ? (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {allTags.map((t, i) => (
              <span key={i} style={{
                fontSize: 10.5, padding: '2px 7px', borderRadius: 3, fontWeight: 500,
                background: t.tone === 'good' ? 'rgba(74,222,128,0.10)' : 'rgba(239,68,68,0.10)',
                color: t.tone === 'good' ? 'var(--green)' : 'var(--red)',
              }}>{t.text}</span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-4)' }}>No tags</div>
        )}
      </div>
    </div>
  )
}

function Timeline({ candidate }: { candidate: Candidate }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 22 }}>
      <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 1, background: 'var(--border)' }} />
      {candidate.timeline.map((t, i) => (
        <div key={i} style={{ position: 'relative', paddingBottom: i < candidate.timeline.length - 1 ? 16 : 0 }}>
          <div style={{
            position: 'absolute', left: -20, top: 5, width: 9, height: 9, borderRadius: '50%',
            background: t.type === 'up' ? 'var(--green)' : t.type === 'down' ? 'var(--red)' : 'var(--text-4)',
            boxShadow: '0 0 0 3px var(--surface)',
          }} />
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', marginBottom: 2 }}>{t.date}</div>
          <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            {t.title}
            {t.grade && (
              <span style={{
                fontSize: 10, padding: '1px 5px', borderRadius: 3, fontWeight: 700, fontFamily: 'monospace',
                background: gradeBg[t.grade], color: gradeColors[t.grade],
              }}>{t.grade}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: 'var(--text-4)', padding: '4px 0' }}>{children}</div>
}
