import CandidateLink from '@/components/CandidateLink'
import { gradeBg, gradeColors } from '@/lib/candidates'

const AT_RISK = [
  { id: 'maja-p', name: 'Maja P.', grade: 'F', trend: '↓', info: 'PH · Lane B · Day 3', flag: 'Late replies' },
  { id: 'ivan-p', name: 'Ivan P.', grade: 'D', trend: '↓', info: 'EU · Week 1 · Day 3', flag: 'Slow start' },
  { id: 'james-t', name: 'James T.', grade: 'D', trend: '↓', info: 'UK · Week 1 · Day 5', flag: 'Tech issues' },
  { id: 'diego-f', name: 'Diego F.', grade: 'D', trend: '→', info: 'SA · Pending · 4d', flag: 'Ghosting' },
]

export default function AtRiskPage() {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>At risk</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Graded D-F or trending down sharply</div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {AT_RISK.map((p, i) => (
          <CandidateLink key={p.id} id={p.id} block>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 20px',
              borderBottom: i < AT_RISK.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 12, fontFamily: 'monospace',
                background: gradeBg[p.grade], color: gradeColors[p.grade], flexShrink: 0,
              }}>{p.grade}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {p.name}
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: p.trend === '↑' ? 'var(--green)' : p.trend === '↓' ? 'var(--red)' : 'var(--text-3)' }}>{p.trend}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.info}
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(239,68,68,0.10)', color: 'var(--red)', fontWeight: 500 }}>{p.flag}</span>
                </div>
              </div>
            </div>
          </CandidateLink>
        ))}
      </div>
    </div>
  )
}
