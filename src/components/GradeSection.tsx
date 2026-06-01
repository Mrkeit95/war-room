'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { saveChatterGrade } from '@/app/(dashboard)/grading/actions'
import { GRADER_ROSTER, type GraderEntry } from '@/lib/grader_roster'

type Cat = { key: string; label: string }
type Scores = Record<string, number | null>

type GradeRow = {
  id: string
  candidateId: string
  weekStarting: string
  graderName: string
  graderRole: string | null
  scores: Scores
  notes: string | null
  updatedAt: string
}

type ApiResp = {
  candidateId: string
  thisWeek: string
  thisWeekGrades: GradeRow[]
  historyComposites: { week: string; composite: number | null; graders: number }[]
  categories: readonly Cat[]
}

const GRADER_KEY = 'war-room.grader-name'

function loadGrader(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(GRADER_KEY) ?? ''
}

function saveGrader(name: string) {
  try { window.localStorage.setItem(GRADER_KEY, name) } catch {}
}

export default function GradeSection({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const [data, setData] = useState<ApiResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [graderName, setGraderName] = useState<string>('')
  const [scores, setScores] = useState<Scores>({})
  const [notes, setNotes] = useState<string>('')
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  // Load grader name from local storage on mount
  useEffect(() => { setGraderName(loadGrader()) }, [])

  // Fetch existing grades for this candidate
  useEffect(() => {
    let cancelled = false
    setError(null)
    fetch(`/api/grading/${candidateId}`)
      .then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j.error ?? `HTTP ${r.status}`) }))
      .then((d: ApiResp) => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [candidateId])

  // When the grader picks themselves, pre-populate their existing scores for this week
  const myExistingRow = useMemo(() => {
    if (!data || !graderName) return null
    return data.thisWeekGrades.find(g => g.graderName.toLowerCase() === graderName.toLowerCase()) ?? null
  }, [data, graderName])

  useEffect(() => {
    if (myExistingRow) {
      setScores({ ...myExistingRow.scores })
      setNotes(myExistingRow.notes ?? '')
    } else if (graderName) {
      setScores({})
      setNotes('')
    }
  }, [myExistingRow, graderName])

  if (error) {
    return (
      <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 14px', fontSize: 12.5, color: 'var(--red)' }}>
        Couldn&apos;t load grades: {error}
      </div>
    )
  }
  if (!data) {
    return <div style={{ padding: 12, fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic' }}>Loading grades…</div>
  }

  const categories = data.categories
  const totalGradersThisWeek = data.thisWeekGrades.length
  const compositeOfMine = computeComposite(scores)

  const otherGraders = data.thisWeekGrades.filter(g => g.graderName.toLowerCase() !== (graderName ?? '').toLowerCase())

  const handleSave = () => {
    setSavedMsg(null)
    const graderEntry = GRADER_ROSTER.find(g => g.name === graderName)
    startSaving(async () => {
      const result = await saveChatterGrade({
        candidateId,
        graderName,
        graderRole: graderEntry?.role ?? null,
        scores,
        notes: notes.trim() || null,
      })
      if (result.ok) {
        saveGrader(graderName)
        setSavedMsg('Saved.')
        // Refresh the API to show the updated this-week aggregate
        const r = await fetch(`/api/grading/${candidateId}`)
        if (r.ok) setData(await r.json())
      } else {
        setSavedMsg(`Failed: ${result.error}`)
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Grader picker + composite */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '12px 14px',
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 4 }}>You are</div>
          <select
            value={graderName}
            onChange={(e) => { setGraderName(e.target.value); saveGrader(e.target.value) }}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', padding: '6px 10px', borderRadius: 6,
              fontSize: 12.5, fontFamily: 'inherit', outline: 'none', width: '100%',
            }}
          >
            <option value="">— pick your name —</option>
            {GraderOptions(GRADER_ROSTER)}
          </select>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 4 }}>Your composite</div>
          <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: compositeOfMine !== null ? 'var(--text)' : 'var(--text-4)' }}>
            {compositeOfMine !== null ? compositeOfMine.toFixed(2) : '—'}
          </div>
        </div>
      </div>

      {/* Grading form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {categories.map(cat => (
          <CategoryRow
            key={cat.key}
            label={cat.label}
            value={scores[cat.key] ?? null}
            disabled={!graderName}
            onChange={(v) => setScores(s => ({ ...s, [cat.key]: v }))}
          />
        ))}
      </div>

      {/* Notes */}
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 6 }}>Notes</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!graderName}
          rows={2}
          placeholder={graderName ? `What stood out about ${candidateName} this week?` : 'Pick your name above to grade.'}
          style={{
            width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text)', padding: '8px 10px', borderRadius: 6,
            fontSize: 12.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
          }}
        />
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace' }}>
          Week of {data.thisWeek}
          {totalGradersThisWeek > 0 && ` · ${totalGradersThisWeek} grader${totalGradersThisWeek === 1 ? '' : 's'} this week`}
        </div>
        <button
          onClick={handleSave}
          disabled={!graderName || isSaving}
          style={{
            background: graderName ? 'var(--text)' : 'var(--surface-3)',
            color: graderName ? 'var(--bg)' : 'var(--text-3)',
            border: 'none', borderRadius: 6, padding: '7px 14px',
            fontSize: 12.5, fontWeight: 600, cursor: graderName && !isSaving ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >{isSaving ? 'Saving…' : 'Save grade'}</button>
      </div>
      {savedMsg && (
        <div style={{ fontSize: 11.5, color: savedMsg.startsWith('Failed') ? 'var(--red)' : 'var(--green)' }}>
          {savedMsg}
        </div>
      )}

      {/* History */}
      {data.historyComposites.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 6 }}>Last 4 weeks</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {data.historyComposites.map(h => (
              <div key={h.week} style={{
                flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '8px 10px',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace', marginBottom: 4 }}>{h.week.slice(5)}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: h.composite !== null ? scoreColor(h.composite) : 'var(--text-4)' }}>
                  {h.composite !== null ? h.composite.toFixed(2) : '—'}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-4)' }}>{h.graders} grader{h.graders === 1 ? '' : 's'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other graders this week */}
      {otherGraders.length > 0 && (
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 6 }}>
            Other graders this week
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {otherGraders.map(g => (
              <div key={g.id} style={{
                fontSize: 11.5, padding: '6px 10px',
                background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6,
                display: 'flex', justifyContent: 'space-between', gap: 12,
              }}>
                <span style={{ color: 'var(--text-2)' }}>{g.graderName} <span style={{ color: 'var(--text-4)' }}>{g.graderRole ? `· ${g.graderRole}` : ''}</span></span>
                <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{(computeComposite(g.scores) ?? 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GraderOptions(roster: GraderEntry[]) {
  // Group by `group` for readable optgroups
  const groups = new Map<string, GraderEntry[]>()
  for (const g of roster) {
    const arr = groups.get(g.group) ?? []
    arr.push(g)
    groups.set(g.group, arr)
  }
  return [...groups.entries()].map(([group, entries]) => (
    <optgroup key={group} label={group}>
      {entries.map(e => <option key={e.name} value={e.name}>{e.displayName}</option>)}
    </optgroup>
  ))
}

function CategoryRow({ label, value, disabled, onChange }: { label: string; value: number | null; disabled: boolean; onChange: (v: number | null) => void }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 12,
      padding: '6px 0', opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{label}</div>
      <div style={{ display: 'flex', gap: 3 }}>
        {[1, 2, 3, 4, 5].map(n => {
          const active = value !== null && n <= value
          return (
            <button
              key={n}
              onClick={() => onChange(value === n ? null : n)}
              disabled={disabled}
              style={{
                width: 22, height: 22, borderRadius: 4,
                background: active ? starColor(value!) : 'var(--surface-3)',
                border: `1px solid ${active ? starColor(value!) : 'var(--border)'}`,
                color: active ? 'var(--bg)' : 'var(--text-4)',
                fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                cursor: disabled ? 'default' : 'pointer',
              }}
              aria-label={`${label}: ${n}`}
            >{n}</button>
          )
        })}
      </div>
    </div>
  )
}

function computeComposite(scores: Scores): number | null {
  const vals = Object.values(scores).filter((v): v is number => typeof v === 'number')
  if (vals.length === 0) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function starColor(v: number): string {
  if (v >= 4.5) return 'var(--green)'
  if (v >= 3.5) return 'var(--blue)'
  if (v >= 2.5) return 'var(--amber)'
  return 'var(--red)'
}

function scoreColor(v: number): string {
  if (v >= 4.0) return 'var(--green)'
  if (v >= 3.0) return 'var(--blue)'
  if (v >= 2.0) return 'var(--amber)'
  return 'var(--red)'
}
