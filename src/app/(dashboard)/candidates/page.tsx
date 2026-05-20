'use client'

import { usePathname, useRouter } from 'next/navigation'
import { gradeBg, gradeColors, nameToId, CANDIDATES } from '@/lib/candidates'

const CANDIDATE_LIST = [
  { name: 'Maria L.', grade: 'A', region: 'EU', stage: 'Week 1 · Day 3', manager: 'Aleksandar', trend: '↑', strengths: ['Fast learner'], flags: [] },
  { name: 'Ivan P.', grade: 'D', region: 'EU', stage: 'Week 1 · Day 3', manager: 'Aleksandar', trend: '↓', strengths: [], flags: ['Slow start'] },
  { name: 'Sofia M.', grade: 'A', region: 'EU', stage: 'Week 1 Exp · Day 3', manager: 'Aleksandar', trend: '↑', strengths: ['Experienced 3yr'], flags: [] },
  { name: 'Anna G.', grade: 'A', region: 'PH', stage: 'Lane A · Week 1 · Day 3', manager: 'Joan', trend: '↑', strengths: ['Grammar', 'Hustle'], flags: [] },
  { name: 'Bea M.', grade: 'A', region: 'PH', stage: 'Lane A · Week 1 · Day 3', manager: 'Joan', trend: '↑', strengths: ['Personality'], flags: [] },
  { name: 'Maja P.', grade: 'F', region: 'PH', stage: 'Lane B · Week 1 · Day 3', manager: 'Mark', trend: '↓', strengths: [], flags: ['Late replies', 'Low engagement'] },
  { name: 'James T.', grade: 'D', region: 'UK', stage: 'Week 1 · Day 5', manager: 'Noah', trend: '↓', strengths: [], flags: ['Tech issues'] },
  { name: 'Carlos M.', grade: 'B', region: 'SA', stage: 'Pending Interview · 6d', manager: 'Sebastien', trend: '→', strengths: ['Experienced'], flags: [] },
  { name: 'Lucia R.', grade: 'C', region: 'SA', stage: 'Pending Interview · 5d', manager: 'Sebastien', trend: '→', strengths: [], flags: [] },
  { name: 'Diego F.', grade: 'D', region: 'SA', stage: 'Pending Interview · 4d', manager: 'Sebastien', trend: '→', strengths: [], flags: ['Ghosting'] },
  { name: 'Jenna K.', grade: 'A', region: 'PH', stage: 'Interview today 1pm', manager: 'Apple', trend: '→', strengths: ['Experienced 2yr'], flags: [] },
  { name: 'FSF', grade: null, region: 'UK', stage: 'Typeform · 5d', manager: 'Noah', trend: '↓', strengths: [], flags: ['Stuck'] },
  { name: 'Noah Whall', grade: null, region: 'UK', stage: 'Typeform · 5d', manager: 'Noah', trend: '↓', strengths: [], flags: ['Stuck'] },
]

function resolveId(name: string): string | null {
  const direct = nameToId(name)
  if (CANDIDATES[direct]) return direct
  for (const [id, c] of Object.entries(CANDIDATES)) {
    if (c.name === name) return id
  }
  return null
}

export default function CandidatesPage() {
  const router = useRouter()
  const pathname = usePathname()

  const openCandidate = (name: string) => {
    const id = resolveId(name)
    if (id) router.push(`${pathname}?candidate=${id}`, { scroll: false })
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Candidates</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>{CANDIDATE_LIST.length} candidates currently visible in the pipeline.</div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Grade', 'Name', 'Region', 'Stage', 'Manager', 'Trend', 'Tags'].map(h => (
                <th key={h} style={{ background: 'var(--surface-2)', padding: '12px 16px', textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CANDIDATE_LIST.map((c, i) => {
              const hasDetail = !!resolveId(c.name)
              return (
                <tr
                  key={c.name}
                  onClick={hasDetail ? () => openCandidate(c.name) : undefined}
                  style={{ cursor: hasDetail ? 'pointer' : 'default', borderBottom: i < CANDIDATE_LIST.length - 1 ? '1px solid var(--border)' : 'none' }}
                >
                  <td style={{ padding: '14px 16px' }}>
                    {c.grade ? (
                      <div style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, fontFamily: 'monospace', background: gradeBg[c.grade], color: gradeColors[c.grade] }}>{c.grade}</div>
                    ) : (
                      <div style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center', fontSize: 11, background: 'var(--surface-3)', color: 'var(--text-4)' }}>—</div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 500, fontSize: 13 }}>{c.name}</td>
                  <td style={{ padding: '14px 16px' }}><span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--surface-3)', fontSize: 11 }}>{c.region}</span></td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>{c.stage}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>{c.manager}</td>
                  <td style={{ padding: '14px 16px', fontWeight: 600, fontFamily: 'monospace', color: c.trend === '↑' ? 'var(--green)' : c.trend === '↓' ? 'var(--red)' : 'var(--text-3)' }}>{c.trend || '—'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.strengths.map(s => <span key={s} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(74,222,128,0.10)', color: 'var(--green)', fontWeight: 500 }}>{s}</span>)}
                      {c.flags.map(f => <span key={f} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(239,68,68,0.10)', color: 'var(--red)', fontWeight: 500 }}>{f}</span>)}
                      {c.strengths.length === 0 && c.flags.length === 0 && <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
