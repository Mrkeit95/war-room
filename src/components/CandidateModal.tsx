'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getCandidate, gradeBg, gradeColors, trajectoryColor, trajectoryIcon, type Candidate as MockCandidate } from '@/lib/candidates'

const NOTES_KEY = 'war-room.candidate-notes'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Display = {
  id: string
  name: string
  region: string
  stage: string
  manager: string | null
  grade: string | null
  trajectory: 'up' | 'down' | 'flat' | null
  tags: { strengths: string[]; flags: string[] }
  timeline: { date: string; title: string; type: 'up' | 'down' | 'flat'; grade?: string }[]
  notes: { date: string; text: string }[]
  meta: { telegram: string | null; country: string | null; email: string | null; source: string | null } | null
}

type DbCandidate = {
  id: string
  name: string
  region: string
  current_stage: string
  current_group_title: string | null
  current_status: string | null
  tier: string | null
  assigned_manager: string | null
  telegram: string | null
  email: string | null
  country: string | null
  source: string | null
  monday_updated_at: string | null
}

function fromMock(c: MockCandidate): Display {
  return {
    id: c.id,
    name: c.name,
    region: c.region,
    stage: c.stage,
    manager: c.manager,
    grade: c.grade,
    trajectory: c.trajectory,
    tags: c.tags,
    timeline: c.timeline.map(t => ({ date: t.date, title: t.title, type: t.type, grade: t.grade ?? undefined })),
    notes: c.notes,
    meta: null,
  }
}

function fromDb(c: DbCandidate): Display {
  const stage = c.current_group_title ?? c.current_stage.replace(/_/g, ' ')
  return {
    id: c.id,
    name: c.name,
    region: c.region,
    stage,
    manager: c.assigned_manager,
    grade: c.tier && /^[A-F]$/i.test(c.tier) ? c.tier.toUpperCase() : null,
    trajectory: null,
    tags: { strengths: [], flags: c.tier && !/^[A-F]$/i.test(c.tier) ? [`Tier: ${c.tier}`] : [] },
    timeline: [],
    notes: [],
    meta: { telegram: c.telegram, country: c.country, email: c.email, source: c.source },
  }
}

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
  const isUuid = !!id && UUID_RE.test(id)

  const [dbCandidate, setDbCandidate] = useState<DbCandidate | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [draft, setDraft] = useState('')
  const [notesStore, setNotesStore] = useState<Record<string, { date: string; text: string }[]>>({})

  useEffect(() => { setNotesStore(loadNotes()) }, [id])

  useEffect(() => {
    if (!isUuid || !id) { setDbCandidate(null); return }
    let cancelled = false
    setLoading(true)
    setFetchError(null)
    fetch(`/api/candidates/${id}`)
      .then(async r => {
        if (!r.ok) throw new Error(`Lookup failed (${r.status})`)
        return r.json()
      })
      .then(d => { if (!cancelled) setDbCandidate(d.candidate as DbCandidate) })
      .catch(err => { if (!cancelled) setFetchError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, isUuid])

  const display: Display | null = useMemo(() => {
    if (!id) return null
    if (isUuid) return dbCandidate ? fromDb(dbCandidate) : null
    const mock = getCandidate(id)
    return mock ? fromMock(mock) : null
  }, [id, isUuid, dbCandidate])

  const close = () => router.push(pathname, { scroll: false })

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!id) return null

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
        {loading && !display ? (
          <LoadingState onClose={close} />
        ) : fetchError ? (
          <ErrorState message={fetchError} onClose={close} />
        ) : !display ? (
          <NotFoundState onClose={close} />
        ) : (
          <Body display={display} notesStore={notesStore} setNotesStore={setNotesStore} draft={draft} setDraft={setDraft} onClose={close} />
        )}
      </div>
    </div>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
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
  )
}

function LoadingState({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading candidate…</div>
        <CloseButton onClose={onClose} />
      </div>
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
        <div style={{ width: 18, height: 18, border: '2px solid var(--surface-3)', borderTopColor: 'var(--text-3)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  )
}

function ErrorState({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, color: 'var(--red)' }}>Failed to load</div>
        <CloseButton onClose={onClose} />
      </div>
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>{message}</div>
    </>
  )
}

function NotFoundState({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Candidate not found</div>
        <CloseButton onClose={onClose} />
      </div>
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
        This candidate isn&apos;t available — they may have been removed from Monday or the id is stale.
      </div>
    </>
  )
}

function Body({
  display, notesStore, setNotesStore, draft, setDraft, onClose,
}: {
  display: Display
  notesStore: Record<string, { date: string; text: string }[]>
  setNotesStore: (s: Record<string, { date: string; text: string }[]>) => void
  draft: string
  setDraft: (s: string) => void
  onClose: () => void
}) {
  const sessionNotes = notesStore[display.id] || []
  const allNotes = [...display.notes, ...sessionNotes]

  const saveNote = () => {
    const text = draft.trim()
    if (!text) return
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const next = { ...notesStore, [display.id]: [...sessionNotes, { date: `${dateStr} (just now)`, text }] }
    setNotesStore(next)
    saveNotesStore(next)
    setDraft('')
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 24px', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'var(--surface)',
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{display.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {display.region} · {display.stage}{display.manager ? ` · ${display.manager}` : ''}
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </div>

      <div style={{ padding: '20px 24px 24px' }}>
        <Header display={display} />
        {display.meta && <MetaRow meta={display.meta} />}

        <Section title="Journey">
          {display.timeline.length === 0 ? (
            <Empty>No timeline yet — transitions are recorded going forward</Empty>
          ) : (
            <Timeline timeline={display.timeline} />
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
              placeholder={`Add a note about ${display.name}…`}
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
    </>
  )
}

function Header({ display }: { display: Display }) {
  const traj = display.trajectory
  const allTags = [
    ...display.tags.strengths.map(t => ({ text: t, tone: 'good' as const })),
    ...display.tags.flags.map(t => ({ text: t, tone: 'bad' as const })),
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 18, fontFamily: 'monospace',
        background: display.grade ? gradeBg[display.grade] : 'var(--surface-3)',
        color: display.grade ? gradeColors[display.grade] : 'var(--text-4)',
      }}>{display.grade || '—'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          {display.name}
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

function MetaRow({ meta }: { meta: NonNullable<Display['meta']> }) {
  const pairs: { label: string; value: string | null }[] = [
    { label: 'Telegram', value: meta.telegram },
    { label: 'Country', value: meta.country },
    { label: 'Email', value: meta.email },
    { label: 'Source', value: meta.source },
  ].filter(p => p.value)

  if (pairs.length === 0) return null

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px',
      padding: '14px 16px', marginBottom: 22,
      background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)',
    }}>
      {pairs.map(p => (
        <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{p.label}</span>
          <span style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function Timeline({ timeline }: { timeline: Display['timeline'] }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 22 }}>
      <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 1, background: 'var(--border)' }} />
      {timeline.map((t, i) => (
        <div key={i} style={{ position: 'relative', paddingBottom: i < timeline.length - 1 ? 16 : 0 }}>
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
